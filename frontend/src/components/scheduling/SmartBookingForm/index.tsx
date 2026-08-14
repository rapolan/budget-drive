import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi, instructorsApi } from '@/api';
import { Student, Instructor, Lesson, CreateLessonInput, FindRankedSlotsResult } from '@/types';
import { ProgressStepper } from '@/components/common';
import { useTenant } from '@/contexts/TenantContext';
import { formatShortDate, formatLocalDate } from '@/utils/timeFormat';
import { extractZipCode } from '@/utils/zipCode';
import { getConflictMessage } from '@/utils/conflictMessages';
import { SlotWithProximity } from './GroupedAvailabilityView';
import { SetupStep, TimePreference, LessonType, DatePreset } from './SetupStep';
import { SlotsStep } from './SlotsStep';
import { ConfirmStep } from './ConfirmStep';
import { SuccessStep } from './SuccessStep';

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  // Locks the instructor as a read-only display card (Reschedule flow) -
  // distinct from prefilledInstructorId below, which seeds a SELECTABLE
  // choice ("Book again"). The two are never both passed by the same caller.
  preselectedInstructor?: Instructor;
  preselectedDate?: Date;
  preselectedTime?: { start: string; end: string };
  // "Book again" prefill (from a student's most recent lesson) - seeds
  // setup-step fields the user can still freely change before searching,
  // never skips ahead the way the preselected* props above do.
  prefilledInstructorId?: string;
  prefilledDuration?: number;
  prefilledLessonType?: LessonType;
  prefilledTimePreference?: TimePreference;
  prefilledPickupAddress?: string;
  onBookingComplete?: (lessonId: string) => void;
  onCancel?: () => void;
}

// Conflict types that can genuinely change between search and confirm
// because another booking landed in between - worth an automatic re-search.
// outside_working_hours/time_off reflect schedule configuration, not a
// timing race, so those stay as a plain error instead.
const RACE_CONDITION_CONFLICT_TYPES = new Set([
  'instructor_busy',
  'vehicle_busy',
  'student_busy',
  'capacity_reached',
  'buffer_violation',
]);

export const SmartBookingForm: React.FC<SmartBookingFormProps> = ({
  preselectedStudent,
  preselectedInstructor,
  preselectedDate,
  preselectedTime,
  prefilledInstructorId,
  prefilledDuration,
  prefilledLessonType,
  prefilledTimePreference,
  prefilledPickupAddress,
  onBookingComplete,
  onCancel,
}) => {
  const canSkipToConfirm = Boolean(
    preselectedStudent && preselectedInstructor && preselectedDate && preselectedTime
  );

  // Tenant-configured default lesson cost (Settings > General > Training
  // Defaults) - prefills the Confirm step's cost field below; the field
  // stays freely editable per lesson, this is only the starting value.
  // Postgres numeric columns come back through the API as strings (e.g.
  // "150.00", not 150), same as defaultHoursRequired already does - must
  // go through Number() or cost.toFixed() below throws at render time.
  const { settings: tenantSettings } = useTenant();
  const defaultLessonCost = Number(tenantSettings?.defaultLessonCost) || 50;

  // Steps: 'setup' (student, pickup, duration, type) -> 'slots' (ranked
  // slots) -> 'confirm' -> 'success' (offers "Book another", loops back to
  // 'slots' with preferences intact - Constraint C).
  const [step, setStep] = useState<'setup' | 'slots' | 'confirm' | 'success'>(canSkipToConfirm ? 'confirm' : 'setup');
  const [error, setError] = useState<string | null>(null);
  const [failedInstructorCount, setFailedInstructorCount] = useState(0);
  const [staleSlotNotice, setStaleSlotNotice] = useState<string | null>(null);
  const [lastBookedLessonId, setLastBookedLessonId] = useState<string | null>(null);

  // Step 1: Setup data
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupZip, setPickupZip] = useState<string | null>(null);
  // Defensive coercion: prefilledDuration should already be a real number by
  // the time it reaches here (its one caller, Students.tsx's handleBookAgain,
  // coerces it), but Number(...) || 120 keeps this component safe on its own
  // terms against any future caller that forgets - Postgres numeric columns
  // arrive as strings ("60.00", not 60), and an uncoerced string here would
  // reach schedulingService's slot-generation arithmetic and silently
  // string-concatenate instead of adding, producing zero search results.
  const [duration, setDuration] = useState(Number(prefilledDuration) || 120);
  const [lessonType, setLessonType] = useState<LessonType>(prefilledLessonType ?? 'behind_wheel');
  // "Book again" instructor prefill - a real, freely-changeable selection,
  // never a locked display (that's preselectedInstructor's job, for
  // Reschedule). Empty string means "any instructor."
  const [selectedInstructorId, setSelectedInstructorId] = useState(prefilledInstructorId ?? '');

  // Step 2: Filters
  const [timePreference, setTimePreference] = useState<TimePreference>(prefilledTimePreference ?? 'any');
  // Search date range - always either copied verbatim from the server-
  // computed datePresets response, or a raw keystroke into a date input.
  // Never computed here (Constraint B - tenant-timezone date math is
  // backend-only, via backend/src/utils/tenantTime.ts).
  const [datePreset, setDatePreset] = useState<DatePreset>('next2Weeks');
  const [searchStartDate, setSearchStartDate] = useState<string | null>(null);
  const [searchEndDate, setSearchEndDate] = useState<string | null>(null);

  // Step 3: Slot selection
  const [slotsWithProximity, setSlotsWithProximity] = useState<SlotWithProximity[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotWithProximity | null>(null);

  // Step 4: Confirm - cost starts at the tenant default (or the same
  // hardcoded 50 fallback used before this setting existed, if the tenant
  // context hasn't finished loading yet) and stays freely editable;
  // costTouched tracks whether the user has actually changed it, so the
  // effect below can keep prefilling as tenantSettings arrives/changes
  // without ever clobbering a real edit.
  const [cost, setCost] = useState(defaultLessonCost);
  const [costTouched, setCostTouched] = useState(false);
  useEffect(() => {
    if (!costTouched) setCost(defaultLessonCost);
  }, [defaultLessonCost, costTouched]);
  const handleSetCost = (value: number) => {
    setCostTouched(true);
    setCost(value);
  };

  const [notes, setNotes] = useState('');
  const [lessonNumber, setLessonNumber] = useState<number | null>(null);

  // Search states
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  const queryClient = useQueryClient();

  // Fetch data
  const { data: studentsData } = useQuery({
    queryKey: ['students', 'booking'],
    queryFn: () => studentsApi.getAll(1, 100),
  });

  const students = studentsData?.data || [];

  // Only needed for "Book again"'s free-choice instructor selector, which
  // only renders when there's no LOCKED preselectedInstructor (Reschedule)
  // - skip the fetch entirely for every other entry point.
  const showInstructorSelector = !preselectedInstructor && prefilledInstructorId !== undefined;
  const { data: instructorsData } = useQuery({
    queryKey: ['instructors', 'booking'],
    queryFn: () => instructorsApi.getAll(),
    enabled: showInstructorSelector,
  });
  const instructors = instructorsData?.data || [];

  // Server-computed date-range preset boundaries (Constraint B) - fetched
  // once, never derived here. See backend/src/services/bookingPresetsService.ts.
  const { data: datePresets } = useQuery({
    queryKey: ['availability', 'date-presets'],
    queryFn: () => schedulingApi.getDatePresets(),
  });

  // Populate the search date inputs from the active preset whenever the
  // preset selection changes or the presets finish loading. Does nothing
  // while datePreset is 'custom' - the user's own keystrokes own those
  // fields at that point.
  useEffect(() => {
    if (!datePresets || datePreset === 'custom') return;
    const boundary: { start: string; end: string } | undefined =
      datePreset === 'next2Weeks' ? datePresets.next2Weeks
      : datePreset === 'thisMonth' ? datePresets.thisMonth
      : datePresets.nextMonth;
    if (!boundary) return;
    setSearchStartDate(boundary.start);
    setSearchEndDate(boundary.end);
  }, [datePresets, datePreset]);

  // Only needed for the "suggested lesson number" field - scoped to the
  // selected student rather than fetching every lesson in the tenant.
  const { data: studentLessonsData } = useQuery({
    queryKey: ['lessons', 'by-student', selectedStudentId],
    queryFn: () => lessonsApi.getByStudent(selectedStudentId),
    enabled: !!selectedStudentId,
  });
  const studentLessons = studentLessonsData?.data || [];

  const selectedStudent = students.find((s: Student) => s.id === selectedStudentId);

  // Auto-fill pickup address when student is selected. "Book again"'s
  // prefilledPickupAddress (the most recent lesson's actual pickup
  // location) takes priority over the student's general home address when
  // both are available - the lesson's own pickup point is the more
  // relevant default for a repeat booking.
  useEffect(() => {
    if (preselectedStudent) {
      setSelectedStudentId(preselectedStudent.id);
      const addr = prefilledPickupAddress || (preselectedStudent.addressLine1
        ? [
            preselectedStudent.addressLine1,
            preselectedStudent.addressLine2,
            preselectedStudent.city && preselectedStudent.state
              ? `${preselectedStudent.city}, ${preselectedStudent.state}`
              : preselectedStudent.city || preselectedStudent.state,
            preselectedStudent.zipCode,
          ].filter(Boolean).join(', ')
        : preselectedStudent.address || '');
      setPickupAddress(addr);
      setPickupZip(extractZipCode(addr) || preselectedStudent.zipCode || null);
    }
  }, [preselectedStudent, prefilledPickupAddress]);

  // Update pickup zip when address changes
  useEffect(() => {
    const zip = extractZipCode(pickupAddress);
    if (zip) {
      setPickupZip(zip);
    }
  }, [pickupAddress]);

  // Calculate suggested lesson number - completedOrScheduled.length + 1 is
  // correct even from an empty array (a student with zero prior lessons
  // suggests "1"), so this only needs to wait for a student to be selected,
  // not for studentLessons to be non-empty.
  useEffect(() => {
    if (selectedStudentId) {
      const completedOrScheduled = studentLessons.filter(
        (l: Lesson) => l.status === 'completed' || l.status === 'scheduled'
      );
      setLessonNumber(completedOrScheduled.length + 1);
    }
  }, [selectedStudentId, studentLessons]);

  // When student, instructor, date, and time are all preselected, skip the
  // search entirely and seed the confirm step directly from those props.
  // Proximity is otherwise computed server-side by findRankedAvailableSlots,
  // so this pre-seeded slot doesn't have a real score - use neutral
  // placeholders (proximityScore/comingFrom aren't rendered for this path).
  useEffect(() => {
    if (!canSkipToConfirm || !preselectedInstructor || !preselectedDate || !preselectedTime) return;

    const slotDate = formatLocalDate(preselectedDate);

    setSelectedSlot({
      date: slotDate,
      startTime: preselectedTime.start,
      endTime: preselectedTime.end,
      instructorId: preselectedInstructor.id,
      available: true,
      proximityScore: 0,
      instructorName: preselectedInstructor.fullName,
      instructorZip: preselectedInstructor.zipCode || null,
      comingFrom: 'home',
    });
    setStep('confirm');
  }, [canSkipToConfirm, preselectedInstructor, preselectedDate, preselectedTime]);

  // Find available slots ranked by proximity - a single server call now
  // does the 6D search across candidate instructors and computes proximity,
  // rather than looping per-instructor and scoring client-side.
  const findSlotsMutation = useMutation({
    mutationFn: (): Promise<FindRankedSlotsResult> =>
      schedulingApi.findRankedAvailableSlots({
        studentId: selectedStudentId,
        pickupZip: pickupZip!,
        duration,
        startDate: searchStartDate ?? undefined,
        endDate: searchEndDate ?? undefined,
        timePreference,
        // A locked preselection (Reschedule) always wins; otherwise use
        // whatever "Book again"'s free-choice selector currently holds
        // (empty string means "any instructor").
        instructorId: preselectedInstructor?.id ?? (selectedInstructorId || undefined),
      }),
    onSuccess: (result) => {
      setSlotsWithProximity(result.slots);
      setFailedInstructorCount(result.failedInstructors.length);
      setStep('slots');
    },
  });

  // Returns whether the search succeeded, so callers (e.g. the stale-slot
  // recovery path below) can tell if the re-search itself also failed.
  const handleFindSlots = async (): Promise<boolean> => {
    if (!selectedStudentId || !pickupZip) {
      setError('Please select a student and ensure pickup address has a valid zip code');
      return false;
    }

    setError(null);
    setFailedInstructorCount(0);
    setStaleSlotNotice(null);

    try {
      await findSlotsMutation.mutateAsync();
      return true;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to find available slots';
      setError(getConflictMessage(err.response?.data?.conflictType, errorMsg));
      console.error('Error finding slots:', err);
      return false;
    }
  };

  const handleSelectSlot = (slot: SlotWithProximity) => {
    setSelectedSlot(slot);
    setStep('confirm');
  };

  const confirmBookingMutation = useMutation({
    mutationFn: (lessonData: CreateLessonInput) => lessonsApi.create(lessonData),
    onSuccess: () => {
      // Match Lessons.tsx's invalidateAllLessonQueries: catches the Weekly
      // view's 'instructor-lessons'-keyed queries too, not just 'lessons'.
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'lessons' || query.queryKey[0] === 'instructor-lessons',
      });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;

    setError(null);

    // selectedSlot's start/end times come back either as bare HH:MM strings
    // or as full ISO datetimes (ranked-slots vs. the preselected-slot-seed
    // path) - extract just the LOCAL HH:MM:SS time portion either way (an
    // ISO string's raw digits are UTC, not what formatTime displays to the
    // user - must go through Date's local getters, same as formatTime does),
    // and send date/startTime/endTime as separate fields (matching what
    // lessonService.ts's else branch already parses with zero timezone
    // conversion) instead of hand-composing a timezone-naive datetime string.
    const extractTime = (value: string): string => {
      if (!value.includes('T')) return `${value}:00`;
      const date = new Date(value);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    const lessonData: CreateLessonInput = {
      studentId: selectedStudentId,
      instructorId: selectedSlot.instructorId,
      vehicleId: null,
      date: selectedSlot.date,
      startTime: extractTime(selectedSlot.startTime),
      endTime: extractTime(selectedSlot.endTime),
      duration,
      lessonType,
      cost,
      pickupAddress: pickupAddress || null,
      notes: notes || undefined,
      lessonNumber: lessonNumber || null,
    };

    try {
      const lesson = await confirmBookingMutation.mutateAsync(lessonData);
      const bookedLessonId = lesson.data?.id || '';
      if (canSkipToConfirm) {
        // Reschedule flow: student/instructor/date/time were all locked in
        // by the caller - there's no meaningful "book another" here, so
        // preserve today's exact behavior (fire immediately, let the
        // parent close the wizard).
        onBookingComplete?.(bookedLessonId);
      } else {
        // Normal search-driven flow (including "Book again") - offer
        // "Book another" before handing control back to the parent.
        setLastBookedLessonId(bookedLessonId);
        setStep('success');
      }
    } catch (err: any) {
      const conflictType = err.response?.data?.conflictType;
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create lesson';

      if (RACE_CONDITION_CONFLICT_TYPES.has(conflictType)) {
        // Another booking landed between search and confirm - the slot we
        // picked is stale. Re-run the search rather than just showing an
        // error, since the fix is usually "pick a different slot." Only
        // show the recovery notice if the re-search actually succeeded -
        // if it also failed, handleFindSlots already set its own error and
        // the user stays wherever they were.
        const researchSucceeded = await handleFindSlots();
        if (researchSucceeded) {
          setStaleSlotNotice('That slot was just taken - here are updated options.');
        }
      } else {
        setError(getConflictMessage(conflictType, errorMsg));
      }
      console.error('Error creating lesson:', err);
    }
  };

  // Constraint C: returns to SLOT SELECTION, never 'setup' - student,
  // instructor choice, duration, lesson type, time preference, and date
  // range are all left untouched. Only clears what's specific to the
  // lesson just booked, then re-runs the same search handleFindSlots
  // already uses for stale-slot recovery, so the just-booked slot is
  // excluded and any newly-created conflict is reflected.
  const [bookingAnother, setBookingAnother] = useState(false);
  const handleBookAnother = async () => {
    setSelectedSlot(null);
    setCost(defaultLessonCost);
    setCostTouched(false);
    setNotes('');
    setLessonNumber(null);
    setStaleSlotNotice(null);
    setError(null);
    setStep('slots');
    setBookingAnother(true);
    try {
      await handleFindSlots();
    } finally {
      setBookingAnother(false);
    }
  };

  // The one place onBookingComplete fires for the normal (non-Reschedule)
  // flow - only once the user explicitly chooses to finish rather than
  // book another.
  const handleDoneBooking = () => {
    onBookingComplete?.(lastBookedLessonId || '');
  };

  const loading = findSlotsMutation.isPending || confirmBookingMutation.isPending || bookingAnother;

  const formatTime = (time: string) => {
    let hour: number, minutes: string;
    if (time.includes('T')) {
      const date = new Date(time);
      hour = date.getHours();
      minutes = date.getMinutes().toString().padStart(2, '0');
    } else {
      const parts = time.split(':');
      hour = parseInt(parts[0]);
      minutes = parts[1];
    }
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getProximityBadge = (score: number) => {
    if (score >= 90) return { label: '🏠 Very Close', class: 'bg-status-success-bg text-status-success-text' };
    if (score >= 70) return { label: '📍 Nearby', class: 'bg-status-success-bg text-status-success-text' };
    if (score >= 50) return { label: '🚗 Close', class: 'bg-status-warning-bg text-status-warning-text' };
    return { label: '🗺️ Far', class: 'bg-surface2 text-tx-secondary' };
  };

  const bookingSteps = [
    { number: 1, label: 'Setup' },
    { number: 2, label: 'Select Slot' },
    { number: 3, label: 'Confirm' },
  ];

  const currentStepNumber = step === 'setup' ? 1 : step === 'slots' ? 2 : 3;
  // 'success' is a terminal state with an optional loop back to slot
  // selection, not really "step 4" of the same journey - the numbered
  // stepper (Setup/Select Slot/Confirm) is simply not shown there.
  const showStepper = step !== 'success';

  return (
    <div className="max-w-4xl mx-auto rounded-3xl bg-surface/80 backdrop-blur-3xl shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60">
      {/* Header */}
      <div className="sticky top-0 bg-surface/40 backdrop-blur-xl border-b border-edge-glass/40 px-6 py-4 z-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-status-info-bg rounded-lg">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-tx-primary">Smart Booking</h2>
              <p className="text-sm text-tx-muted">Find the closest available instructor</p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {showStepper && <ProgressStepper steps={bookingSteps} currentStep={currentStepNumber} />}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-6 bg-status-danger-bg border border-status-danger-border rounded-lg p-4">
          <p className="text-status-danger-text text-sm">{error}</p>
        </div>
      )}

      {step === 'setup' && (
        <SetupStep
          preselectedStudent={preselectedStudent}
          preselectedInstructor={preselectedInstructor}
          selectedStudent={selectedStudent}
          selectedStudentId={selectedStudentId}
          setSelectedStudentId={setSelectedStudentId}
          students={students}
          studentSearch={studentSearch}
          setStudentSearch={setStudentSearch}
          showStudentDropdown={showStudentDropdown}
          setShowStudentDropdown={setShowStudentDropdown}
          pickupAddress={pickupAddress}
          setPickupAddress={setPickupAddress}
          pickupZip={pickupZip}
          setPickupZip={setPickupZip}
          lessonType={lessonType}
          setLessonType={setLessonType}
          duration={duration}
          setDuration={setDuration}
          timePreference={timePreference}
          setTimePreference={setTimePreference}
          datePresets={datePresets}
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          searchStartDate={searchStartDate}
          setSearchStartDate={setSearchStartDate}
          searchEndDate={searchEndDate}
          setSearchEndDate={setSearchEndDate}
          showInstructorSelector={showInstructorSelector}
          instructors={instructors}
          selectedInstructorId={selectedInstructorId}
          setSelectedInstructorId={setSelectedInstructorId}
          loading={loading}
          onCancel={onCancel}
          onFindSlots={handleFindSlots}
        />
      )}

      {step === 'slots' && (
        <SlotsStep
          pickupAddress={pickupAddress}
          staleSlotNotice={staleSlotNotice}
          failedInstructorCount={failedInstructorCount}
          slotsWithProximity={slotsWithProximity}
          onSelectSlot={handleSelectSlot}
          formatSlotDate={formatShortDate}
          formatTime={formatTime}
          getProximityBadge={getProximityBadge}
          onChangeFilters={() => setStep('setup')}
        />
      )}

      {step === 'confirm' && selectedSlot && (
        <ConfirmStep
          selectedStudent={selectedStudent}
          selectedSlot={selectedSlot}
          lessonType={lessonType}
          duration={duration}
          pickupAddress={pickupAddress}
          lessonNumber={lessonNumber}
          setLessonNumber={setLessonNumber}
          cost={cost}
          setCost={handleSetCost}
          notes={notes}
          setNotes={setNotes}
          loading={loading}
          formatShortDate={formatShortDate}
          formatTime={formatTime}
          getProximityBadge={getProximityBadge}
          onBack={() => setStep('slots')}
          onConfirm={handleConfirmBooking}
        />
      )}

      {step === 'success' && selectedSlot && (
        <SuccessStep
          selectedStudent={selectedStudent}
          bookedSlot={selectedSlot}
          loading={loading}
          formatShortDate={formatShortDate}
          formatTime={formatTime}
          onBookAnother={handleBookAnother}
          onDone={handleDoneBooking}
        />
      )}
    </div>
  );
};

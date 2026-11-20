import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi, instructorsApi } from '@/api';
import { Student, Instructor, Lesson, CreateLessonInput, FindRankedSlotsResult } from '@/types';
import { ProgressStepper } from '@/components/common';
import { useTenant } from '@/contexts/TenantContext';
import { formatShortDate, formatLocalDate, addCalendarDays, daysBetween } from '@/utils/timeFormat';
import { extractZipCode } from '@/utils/zipCode';
import { resolveStudentPickupAddress } from '@/utils/studentPickupAddress';
import { getConflictMessage } from '@/utils/conflictMessages';
import { SlotWithProximity } from './GroupedAvailabilityView';
import { SetupStep, TimePreference, LessonType, DatePreset } from './SetupStep';
import { SlotsStep } from './SlotsStep';
import { ConfirmStep } from './ConfirmStep';
import { SuccessStep } from './SuccessStep';

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  // Locks the instructor as a read-only display card. Historically also
  // doubled as "the Reschedule flow," but Reschedule now has its own
  // explicit existingLesson prop below - preselectedInstructor on its own
  // (no existingLesson) is only reachable today via
  // handleAvailabilityClick/handleWeeklyBookSlot (clicking an open slot on
  // the calendar/weekly view to book a NEW lesson there), which also
  // always sets preselectedDate/preselectedTime and triggers
  // canSkipToConfirm.
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
  // Presence of this prop IS reschedule mode: the student is locked (same
  // treatment preselectedStudent already gives for free - see SetupStep,
  // no component change needed there), the instructor seeds the
  // free-choice selector via prefilledInstructorId (never locked - the
  // whole point of rescheduling is finding a possibly-different slot),
  // confirm calls lessonsApi.update(existingLesson.id, ...) instead of
  // lessonsApi.create(...), and existingLesson.id is sent as
  // excludeLessonId to BOTH the ranked-slots search and (automatically,
  // server-side) the confirm/update's own conflict check - without the
  // search-time exclusion, the lesson being rescheduled shows up as
  // already occupying its own slot/day, which (confirmed live) can hide
  // the ENTIRE day's availability for the student whenever
  // maxLessonsPerStudentPerDay is already met by the lesson being moved.
  // Never combined with preselectedInstructor/preselectedDate/
  // preselectedTime/canSkipToConfirm - rescheduling always runs a fresh
  // search, it never jumps straight to Confirm.
  existingLesson?: Lesson;
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
  existingLesson,
  onBookingComplete,
  onCancel,
}) => {
  const isReschedule = Boolean(existingLesson);
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

  // Fetch data. Skipped entirely when a student is already preselected
  // (Reschedule, or any other preselectedStudent caller - Dashboard.tsx,
  // Students.tsx's "book again") - the search/dropdown UI this fetch feeds
  // never renders in that case, so a 100-row fetch on every such modal
  // open was pure waste. Found during the lesson-edit-redesign work.
  const { data: studentsData } = useQuery({
    queryKey: ['students', 'booking'],
    queryFn: () => studentsApi.getAll(1, 100),
    enabled: !preselectedStudent,
  });

  const students = studentsData?.data || [];

  // Only needed for the free-choice instructor selector - "Book again"
  // (prefilledInstructorId, no lock) or Reschedule (same prefill
  // mechanism, via existingLesson below) - never for a LOCKED
  // preselectedInstructor (calendar/weekly-view slot booking), which skips
  // the fetch entirely since it renders a read-only card instead.
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

  // students is empty whenever preselectedStudent is set (its fetch is
  // disabled above, since the search/dropdown it feeds never renders in
  // that case) - fall back to preselectedStudent directly so this doesn't
  // silently resolve to undefined for every preselected-student caller.
  const selectedStudent = preselectedStudent ?? students.find((s: Student) => s.id === selectedStudentId);

  // Auto-fill pickup address when student is selected. "Book again"'s
  // prefilledPickupAddress (the most recent lesson's actual pickup
  // location) takes priority over resolveStudentPickupAddress (the
  // student's own designated pickup address if set, else their home
  // address) when both are available - the lesson's own pickup point is
  // the more relevant default for a repeat booking.
  useEffect(() => {
    if (preselectedStudent) {
      setSelectedStudentId(preselectedStudent.id);
      const addr = prefilledPickupAddress || resolveStudentPickupAddress(preselectedStudent);
      setPickupAddress(addr);
      setPickupZip(extractZipCode(addr) || preselectedStudent.pickupZipCode || preselectedStudent.zipCode || null);
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
      // preselectedTime.start/.end are already plain HH:MM (passed in from
      // the parent calendar view, never a real ranked-slot ISO instant on
      // this skip-to-confirm path) - the *Local fields are the same value.
      startTimeLocal: preselectedTime.start,
      endTimeLocal: preselectedTime.end,
      instructorId: preselectedInstructor.id,
      available: true,
      proximityScore: 0,
      instructorName: preselectedInstructor.fullName,
      instructorZip: preselectedInstructor.zipCode || null,
      comingFrom: 'home',
      outsideServiceArea: false,
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
        // A locked preselectedInstructor (calendar/weekly-view slot click)
        // always wins; otherwise use whatever "Book again"/Reschedule's
        // free-choice selector currently holds (empty string means "any
        // instructor").
        instructorId: preselectedInstructor?.id ?? (selectedInstructorId || undefined),
        // Reschedule mode: excludes the lesson being moved from the search
        // itself, not just the final confirm/update - without this, the
        // lesson shows up as already occupying its own slot/day, which can
        // hide the whole day's availability once maxLessonsPerStudentPerDay
        // is met by the lesson being rescheduled (confirmed live).
        excludeLessonId: existingLesson?.id,
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
    // Reschedule mode calls update(), never create() - PUT /lessons/:id
    // always excludes the lesson being updated from its own conflict
    // check server-side (lessonService.ts's updateLesson passes `id` as
    // excludeLessonId automatically), so no client-side exclusion param is
    // needed here.
    mutationFn: (lessonData: CreateLessonInput | Partial<CreateLessonInput>) =>
      isReschedule
        ? lessonsApi.update(existingLesson!.id, lessonData)
        : lessonsApi.create(lessonData as CreateLessonInput),
    onSuccess: () => {
      // Match Lessons.tsx's invalidateAllLessonQueries: catches the Weekly
      // view's 'instructor-lessons'-keyed queries too, not just 'lessons'.
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'lessons' || query.queryKey[0] === 'instructor-lessons',
      });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      // The Students list's progress bar reads student.progress, which is
      // computed server-side from this student's lessons - without this,
      // a freshly booked lesson doesn't move the bar until an unrelated
      // refetch happens to invalidate ['students'] first.
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;

    setError(null);

    // selectedSlot.startTimeLocal/endTimeLocal are already tenant wall-clock
    // "HH:MM" strings - read directly, never parse startTime/endTime's ISO
    // instant via new Date().getHours() (that reads the BROWSER's own
    // timezone offset, not the tenant's - see docs/ARCHITECTURE.md §7).
    // Sent as separate date/startTime/endTime fields (matching what
    // lessonService.ts's else branch already parses with zero timezone
    // conversion) instead of hand-composing a timezone-naive datetime string -
    // this is the SAME field shape updateLesson reads on the reschedule
    // path below, unlike LessonModal.tsx's old create path, which sent a
    // scheduledStart/scheduledEnd shape updateLesson has no conversion for
    // at all (a real, already-fixed-once production bug - see
    // docs/ARCHITECTURE.md §30). Getting this shape right on both branches
    // is the single highest-risk detail of reschedule mode.
    const scheduleFields = {
      instructorId: selectedSlot.instructorId,
      vehicleId: selectedSlot.vehicleId,
      date: selectedSlot.date,
      startTime: `${selectedSlot.startTimeLocal}:00`,
      endTime: `${selectedSlot.endTimeLocal}:00`,
      duration,
      lessonType,
      cost,
      pickupAddress: pickupAddress || null,
      notes: notes || undefined,
      lessonNumber: lessonNumber || null,
    };

    // Reschedule never sends studentId at all - the student is locked/
    // fixed, and updateLesson treats studentId's mere PRESENCE (even when
    // unchanged) as a potential reassignment, running its own
    // enrollment-resolution branch for no reason. Omitting the key
    // entirely is simplest and safest. Create always needs studentId
    // (CreateLessonInput requires it); vehicleId is auto-assigned
    // server-side on create if left null, matching create's existing
    // behavior - the slot's own vehicleId is only meaningful on reschedule,
    // where it reflects what the search actually found available.
    const lessonData: CreateLessonInput | Partial<CreateLessonInput> = isReschedule
      ? scheduleFields
      : { ...scheduleFields, studentId: selectedStudentId, vehicleId: null };

    try {
      const lesson = await confirmBookingMutation.mutateAsync(lessonData);
      const bookedLessonId = lesson.data?.id || '';
      if (isReschedule || canSkipToConfirm) {
        // Reschedule, or the locked calendar/weekly-view slot-click flow
        // (canSkipToConfirm) - both are "exactly one lesson, done in one
        // shot," with no meaningful "book another" here, so fire
        // immediately and let the parent close the wizard.
        onBookingComplete?.(bookedLessonId);
      } else {
        // Normal search-driven flow (including "Book again") - offer
        // "Book another" before handing control back to the parent.
        setLastBookedLessonId(bookedLessonId);
        setStep('success');
      }
    } catch (err: any) {
      const conflictType = err.response?.data?.conflictType;
      const fallbackMsg = isReschedule ? 'Failed to reschedule lesson' : 'Failed to create lesson';
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || fallbackMsg;

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
      console.error(isReschedule ? 'Error rescheduling lesson:' : 'Error creating lesson:', err);
    }
  };

  // Returns to SETUP (not slots) with student, instructor choice, duration,
  // lesson type, and time preference all left untouched - only what's
  // specific to the lesson just booked is cleared, plus the date range,
  // which is pre-advanced to start the day after that lesson so the common
  // case (booking the next one in a sequence) needs no editing before the
  // user runs a fresh search. searchStartDate/searchEndDate/datePreset are
  // otherwise never computed here (Constraint B - tenant-timezone date math
  // is backend-only) - this is the one exception, and it's still just
  // calendar-day arithmetic on an already-resolved YYYY-MM-DD date string
  // (the just-booked slot's date), not a timezone interpretation.
  const handleBookAnother = () => {
    const bookedDate = selectedSlot?.date;
    setSelectedSlot(null);
    setCost(defaultLessonCost);
    setCostTouched(false);
    setNotes('');
    setLessonNumber(null);
    setStaleSlotNotice(null);
    setError(null);
    if (bookedDate) {
      const nextDayStart = addCalendarDays(bookedDate, 1);
      const currentRangeLength = searchStartDate && searchEndDate
        ? daysBetween(searchStartDate, searchEndDate)
        : 13;
      setDatePreset('custom');
      setSearchStartDate(nextDayStart);
      setSearchEndDate(addCalendarDays(nextDayStart, currentRangeLength));
    }
    setStep('setup');
  };

  // The one place onBookingComplete fires for the normal (non-Reschedule)
  // flow - only once the user explicitly chooses to finish rather than
  // book another.
  const handleDoneBooking = () => {
    onBookingComplete?.(lastBookedLessonId || '');
  };

  const loading = findSlotsMutation.isPending || confirmBookingMutation.isPending;

  // Always receives a tenant wall-clock "HH:MM" string (startTimeLocal/
  // endTimeLocal) - never a raw ISO instant. Plain string/number math, no
  // Date object involved (see docs/ARCHITECTURE.md §7).
  const formatTime = (time: string) => {
    const [hoursStr, minutes] = time.split(':');
    const hour = parseInt(hoursStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Three-tier travel-distance scale mapped onto the 0-100 proximityScore
  // range computed server-side (calculateProximityScore: 100 same zip, 70
  // same region, 50 unknown/neutral, 30 different regions). Thresholds
  // cover the full range with no gap: [80,100] Nearby, [50,80) Moderate,
  // [0,50) Far - so 100/70/50/30 land as Nearby/Moderate/Moderate/Far.
  const getProximityBadge = (score: number) => {
    if (score >= 80) return { label: '🏠 Nearby', class: 'bg-status-success-bg text-status-success-text' };
    if (score >= 50) return { label: '📍 Moderate', class: 'bg-status-warning-bg text-status-warning-text' };
    return { label: '🗺️ Far', class: 'bg-status-terracotta-bg text-status-terracotta-text' };
  };

  // Orthogonal to proximity - null on the common (in-area) case so callers
  // render nothing extra, per docs/BLUEPRINTS.md's filter-with-fallback rule.
  const getServiceAreaBadge = (outsideServiceArea: boolean) =>
    outsideServiceArea
      ? { label: 'Outside usual area', class: 'bg-status-warning-bg text-status-warning-text' }
      : null;

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

  // The wizard itself doesn't scroll - its callers (Students.tsx, Lessons.tsx)
  // wrap it in a fixed-height "max-h-[90vh] overflow-y-auto" modal container,
  // which retains whatever scroll position the slots list left it at. Without
  // this, the confirm step can render partway down that container, showing
  // the middle of the Booking Summary instead of its top. Scrolls the
  // nearest scrollable ancestor to 0 whenever the confirm step becomes
  // active - not on every render, so it doesn't fight a user scrolling
  // within the confirm step itself.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== 'confirm') return;
    const scrollContainer = rootRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    if (!scrollContainer) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollContainer.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [step]);

  return (
    <div ref={rootRef} className="max-w-4xl mx-auto rounded-3xl bg-surface/95 shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60">
      {/* Header */}
      <div className="sticky top-0 bg-surface/95 border-b border-edge-glass/40 px-6 py-4 z-10">
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
          getServiceAreaBadge={getServiceAreaBadge}
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

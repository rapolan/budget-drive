import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi } from '@/api';
import { Student, Instructor, Lesson, CreateLessonInput, FindRankedSlotsResult } from '@/types';
import { ProgressStepper } from '@/components/common';
import { formatShortDate, formatLocalDate } from '@/utils/timeFormat';
import { extractZipCode } from '@/utils/zipCode';
import { getConflictMessage } from '@/utils/conflictMessages';
import { SlotWithProximity } from './GroupedAvailabilityView';
import { SetupStep, TimePreference, LessonType } from './SetupStep';
import { SlotsStep } from './SlotsStep';
import { ConfirmStep } from './ConfirmStep';

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  preselectedInstructor?: Instructor;
  preselectedDate?: Date;
  preselectedTime?: { start: string; end: string };
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
  onBookingComplete,
  onCancel,
}) => {
  const canSkipToConfirm = Boolean(
    preselectedStudent && preselectedInstructor && preselectedDate && preselectedTime
  );

  // Steps: 'setup' (student, pickup, duration, type) -> 'filter' (date/time prefs) -> 'slots' (ranked slots) -> 'confirm'
  const [step, setStep] = useState<'setup' | 'slots' | 'confirm'>(canSkipToConfirm ? 'confirm' : 'setup');
  const [error, setError] = useState<string | null>(null);
  const [failedInstructorCount, setFailedInstructorCount] = useState(0);
  const [staleSlotNotice, setStaleSlotNotice] = useState<string | null>(null);

  // Step 1: Setup data
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupZip, setPickupZip] = useState<string | null>(null);
  const [duration, setDuration] = useState(120);
  const [lessonType, setLessonType] = useState<LessonType>('behind_wheel');

  // Step 2: Filters
  const [timePreference, setTimePreference] = useState<TimePreference>('any');
  const [dateRange] = useState(14); // days ahead to search

  // Step 3: Slot selection
  const [slotsWithProximity, setSlotsWithProximity] = useState<SlotWithProximity[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotWithProximity | null>(null);

  // Step 4: Confirm
  const [cost, setCost] = useState(50);
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

  // Only needed for the "suggested lesson number" field - scoped to the
  // selected student rather than fetching every lesson in the tenant.
  const { data: studentLessonsData } = useQuery({
    queryKey: ['lessons', 'by-student', selectedStudentId],
    queryFn: () => lessonsApi.getByStudent(selectedStudentId),
    enabled: !!selectedStudentId,
  });
  const studentLessons = studentLessonsData?.data || [];

  const selectedStudent = students.find((s: Student) => s.id === selectedStudentId);

  // Auto-fill pickup address when student is selected
  useEffect(() => {
    if (preselectedStudent) {
      setSelectedStudentId(preselectedStudent.id);
      const addr = preselectedStudent.addressLine1
        ? [
            preselectedStudent.addressLine1,
            preselectedStudent.addressLine2,
            preselectedStudent.city && preselectedStudent.state
              ? `${preselectedStudent.city}, ${preselectedStudent.state}`
              : preselectedStudent.city || preselectedStudent.state,
            preselectedStudent.zipCode,
          ].filter(Boolean).join(', ')
        : preselectedStudent.address || '';
      setPickupAddress(addr);
      setPickupZip(extractZipCode(addr) || preselectedStudent.zipCode || null);
    }
  }, [preselectedStudent]);

  // Update pickup zip when address changes
  useEffect(() => {
    const zip = extractZipCode(pickupAddress);
    if (zip) {
      setPickupZip(zip);
    }
  }, [pickupAddress]);

  // Calculate suggested lesson number
  useEffect(() => {
    if (selectedStudentId && studentLessons.length > 0) {
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
        dateRange,
        timePreference,
        instructorId: preselectedInstructor?.id,
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
      onBookingComplete?.(lesson.data?.id || '');
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

  const loading = findSlotsMutation.isPending || confirmBookingMutation.isPending;

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
    if (score >= 90) return { label: '🏠 Very Close', class: 'bg-green-100 text-green-800' };
    if (score >= 70) return { label: '📍 Nearby', class: 'bg-green-100 text-green-700' };
    if (score >= 50) return { label: '🚗 Close', class: 'bg-yellow-100 text-yellow-700' };
    return { label: '🗺️ Far', class: 'bg-surface2 text-tx-secondary' };
  };

  const bookingSteps = [
    { number: 1, label: 'Setup' },
    { number: 2, label: 'Select Slot' },
    { number: 3, label: 'Confirm' },
  ];

  const currentStepNumber = step === 'setup' ? 1 : step === 'slots' ? 2 : 3;

  return (
    <div className="bg-surface rounded-lg shadow-xl max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-[var(--border)] p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-tx-primary">Smart Booking</h2>
              <p className="text-sm text-tx-muted">Find the closest available instructor</p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-colors"
            >
              <span className="text-2xl">×</span>
            </button>
          )}
        </div>
        <ProgressStepper steps={bookingSteps} currentStep={currentStepNumber} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
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
          setCost={setCost}
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
    </div>
  );
};

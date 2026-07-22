import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, User, Clock, MapPin, CheckCircle, Sparkles, FileText, Sun, Sunset, Moon, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi } from '@/api';
import { Student, Instructor, Lesson, RankedTimeSlot } from '@/types';
import { ProgressStepper } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { extractZipCode } from '@/utils/zipCode';

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  preselectedInstructor?: Instructor;
  preselectedDate?: Date;
  preselectedTime?: { start: string; end: string };
  onBookingComplete?: (lessonId: string) => void;
  onCancel?: () => void;
}

// Slot with proximity info, computed server-side by findRankedAvailableSlots
type SlotWithProximity = RankedTimeSlot;

type TimePreference = 'any' | 'morning' | 'afternoon' | 'evening';

// Instructor-Based Grouped Availability View Component for SmartBookingForm
interface GroupedAvailabilityViewProps {
  slots: SlotWithProximity[];
  onSelectSlot: (slot: SlotWithProximity) => void;
  formatSlotDate: (dateStr: string) => string;
  formatTime: (time: string) => string;
  getProximityBadge: (score: number) => { label: string; class: string };
}

const GroupedAvailabilityView: React.FC<GroupedAvailabilityViewProps> = ({
  slots,
  onSelectSlot,
  formatSlotDate,
  formatTime,
  getProximityBadge,
}) => {
  const [expandedInstructors, setExpandedInstructors] = useState<Set<string>>(new Set());

  // Group slots by instructor
  const instructorGroups = useMemo(() => {
    const groups = new Map<string, SlotWithProximity[]>();

    slots.forEach(slot => {
      if (!groups.has(slot.instructorId)) {
        groups.set(slot.instructorId, []);
      }
      groups.get(slot.instructorId)!.push(slot);
    });

    // Convert to array and sort by best proximity score of each instructor
    return Array.from(groups.entries())
      .map(([instructorId, instructorSlots]) => {
        const bestScore = Math.max(...instructorSlots.map((s: SlotWithProximity) => s.proximityScore));
        const instructor = instructorSlots[0]; // Get instructor details from first slot

        // Group this instructor's slots by date
        const slotsByDate: { [date: string]: SlotWithProximity[] } = {};
        instructorSlots.forEach((slot: SlotWithProximity) => {
          if (!slotsByDate[slot.date]) {
            slotsByDate[slot.date] = [];
          }
          slotsByDate[slot.date].push(slot);
        });

        // Sort dates and slots
        const sortedDates = Object.entries(slotsByDate)
          .map(([date, dateSlots]) => ({
            date,
            label: formatSlotDate(date),
            slots: dateSlots.sort((a, b) => a.startTime.localeCompare(b.startTime)),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          instructorId: instructorId,
          instructorName: instructor.instructorName,
          bestProximityScore: bestScore,
          comingFrom: instructor.comingFrom,
          totalSlots: instructorSlots.length,
          dateGroups: sortedDates,
        };
      })
      .sort((a, b) => b.bestProximityScore - a.bestProximityScore); // Sort by best proximity
  }, [slots, formatSlotDate]);

  const toggleInstructor = (instructorId: string) => {
    setExpandedInstructors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instructorId)) {
        newSet.delete(instructorId);
      } else {
        newSet.add(instructorId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-tx-muted">{instructorGroups.length} instructors available (sorted by proximity)</p>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {instructorGroups.map((instructor, index) => {
          const isExpanded = expandedInstructors.has(instructor.instructorId);
          const badge = getProximityBadge(instructor.bestProximityScore);

          return (
            <div key={instructor.instructorId} className="bg-surface rounded-xl border-2 border-[var(--border)] overflow-hidden">
              {/* Instructor Header - Clickable */}
              <button
                type="button"
                onClick={() => toggleInstructor(instructor.instructorId)}
                className="w-full p-4 flex items-center gap-3 hover:bg-surface2 transition-colors text-left"
              >
                {/* Rank indicator */}
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base flex-shrink-0 ${
                  index < 3 ? 'bg-green-100 text-green-700' : 'bg-surface2 text-tx-muted'
                }`}>
                  #{index + 1}
                </div>

                {/* Instructor info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-tx-primary text-base md:text-lg">{instructor.instructorName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.class}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-sm text-tx-secondary mt-1">
                    {instructor.totalSlots} available {instructor.totalSlots === 1 ? 'slot' : 'slots'}
                  </div>
                </div>

                {/* Expand/Collapse Icon */}
                <div className="text-tx-muted flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </button>

              {/* Expanded: Show slots grouped by date */}
              {isExpanded && (
                <div className="border-t border-[var(--border)] bg-surface2 p-3 space-y-3">
                  {instructor.dateGroups.map(dateGroup => (
                    <div key={dateGroup.date}>
                      {/* Date header */}
                      <div className="text-xs font-semibold text-tx-secondary mb-2 px-1">
                        {dateGroup.label}
                      </div>

                      {/* Time slots for this date */}
                      <div className="space-y-2">
                        {dateGroup.slots.map((slot, idx) => (
                          <button
                            key={`${slot.instructorId}-${slot.date}-${slot.startTime}-${idx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSlot(slot);
                            }}
                            className="w-full p-3 bg-surface border border-[var(--border)] rounded-lg hover:border-primary hover:bg-blue-50 transition-all text-left flex items-center justify-between active:scale-[0.98]"
                          >
                            <span className="text-sm font-medium text-tx-primary">
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                            <span className="text-tx-muted text-sm">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedInstructorCount, setFailedInstructorCount] = useState(0);

  // Step 1: Setup data
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupZip, setPickupZip] = useState<string | null>(null);
  const [duration, setDuration] = useState(120);
  const [lessonType, setLessonType] = useState<'behind_wheel' | 'classroom' | 'observation' | 'road_test'>('behind_wheel');
  
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

  // Helper: Get full address string from student's structured fields
  const getStudentFullAddress = (student: Student): string => {
    if (student.addressLine1) {
      const parts = [
        student.addressLine1,
        student.addressLine2,
        student.city && student.state ? `${student.city}, ${student.state}` : student.city || student.state,
        student.zipCode
      ].filter(Boolean);
      return parts.join(', ');
    }
    return student.address || '';
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Get display name
  const getStudentDisplay = (student: Student) => {
    const duplicates = students.filter(s => s.fullName === student.fullName);
    if (duplicates.length > 1) {
      return `${student.fullName} (${student.email})`;
    }
    return student.fullName;
  };

  const filteredStudents = students.filter((s: Student) =>
    s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const selectedStudent = students.find((s: Student) => s.id === selectedStudentId);

  // Auto-fill pickup address when student is selected
  useEffect(() => {
    if (preselectedStudent) {
      setSelectedStudentId(preselectedStudent.id);
      const addr = getStudentFullAddress(preselectedStudent);
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

    const slotDate = preselectedDate.toISOString().split('T')[0];

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

  // Translate raw backend error text into friendly, actionable copy
  const getConflictMessage = (errorMessage: string): string => {
    if (errorMessage.includes('instructor already has a lesson')) {
      return 'This instructor already has another lesson at this time. Please choose a different time slot.';
    }
    if (errorMessage.includes('student already has a lesson')) {
      return 'This student already has another lesson scheduled at this time. Please choose a different time slot.';
    }
    if (errorMessage.includes('buffer time')) {
      return 'There needs to be a 30-minute buffer between lessons. Please choose a time slot with more spacing.';
    }
    if (errorMessage.includes('capacity')) {
      return 'This instructor has reached their maximum students for the day. Please choose a different day.';
    }
    if (errorMessage.includes('outside availability')) {
      return 'This time is outside the instructor\'s available hours. Please choose a different time slot.';
    }
    if (errorMessage.includes('vehicle is not available')) {
      return 'The vehicle is already in use at this time. Please choose a different time slot.';
    }
    return errorMessage;
  };

  // Find available slots ranked by proximity - a single server call now
  // does the 6D search across candidate instructors and computes proximity,
  // rather than looping per-instructor and scoring client-side.
  const handleFindSlots = async () => {
    if (!selectedStudentId || !pickupZip) {
      setError('Please select a student and ensure pickup address has a valid zip code');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setFailedInstructorCount(0);

      const result = await schedulingApi.findRankedAvailableSlots({
        studentId: selectedStudentId,
        pickupZip,
        duration,
        dateRange,
        timePreference,
        instructorId: preselectedInstructor?.id,
      });

      setSlotsWithProximity(result.slots);
      setFailedInstructorCount(result.failedInstructors.length);
      setStep('slots');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to find available slots';
      setError(getConflictMessage(errorMsg));
      console.error('Error finding slots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlot = (slot: SlotWithProximity) => {
    setSelectedSlot(slot);
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;

    try {
      setLoading(true);
      setError(null);

      const dateStr = selectedSlot.date;
      let scheduledStart: string;
      let scheduledEnd: string;
      
      if (selectedSlot.startTime.includes('T')) {
        scheduledStart = selectedSlot.startTime;
        scheduledEnd = selectedSlot.endTime;
      } else {
        scheduledStart = `${dateStr}T${selectedSlot.startTime}:00`;
        scheduledEnd = `${dateStr}T${selectedSlot.endTime}:00`;
      }

      const lessonData: any = {
        studentId: selectedStudentId,
        instructorId: selectedSlot.instructorId,
        vehicleId: null,
        scheduledStart,
        scheduledEnd,
        lessonType,
        cost,
        pickupAddress: pickupAddress || null,
        notes: notes || null,
        lessonNumber: lessonNumber || null,
      };

      const lesson = await lessonsApi.create(lessonData);
      onBookingComplete?.(lesson.data?.id || '');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create lesson';
      setError(getConflictMessage(errorMsg));
      console.error('Error creating lesson:', err);
    } finally {
      setLoading(false);
    }
  };

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

      {/* Step 1: Setup */}
      {step === 'setup' && (
        <div className="p-6 space-y-6">
          {/* Student Selection */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-primary" />
              <label className="block text-sm font-semibold text-tx-primary">
                Student <span className="text-red-500">*</span>
              </label>
            </div>
            {preselectedStudent ? (
              <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
                  {getInitials(preselectedStudent.fullName)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-tx-primary">{preselectedStudent.fullName}</div>
                  <div className="text-sm text-tx-secondary">{preselectedStudent.email}</div>
                </div>
              </div>
            ) : selectedStudent ? (
              <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
                  {getInitials(selectedStudent.fullName)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-tx-primary">{selectedStudent.fullName}</div>
                  <div className="text-sm text-tx-secondary">{selectedStudent.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudentId('');
                    setStudentSearch('');
                    setPickupAddress('');
                    setPickupZip(null);
                  }}
                  className="text-sm text-primary hover:text-blue-800 font-medium"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setShowStudentDropdown(true);
                  }}
                  onFocus={() => setShowStudentDropdown(true)}
                  placeholder="Search by name or email..."
                  autoComplete="nope"
                  className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                {showStudentDropdown && filteredStudents.length > 0 && (
                  <div className="absolute z-20 w-full mt-2 bg-surface border border-[var(--border-strong)] rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {filteredStudents.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(student.id);
                          setStudentSearch(getStudentDisplay(student));
                          setShowStudentDropdown(false);
                          const addr = getStudentFullAddress(student);
                          setPickupAddress(addr);
                          setPickupZip(extractZipCode(addr) || student.zipCode || null);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-[var(--border)] last:border-0 flex items-center space-x-3"
                      >
                        <div className="h-10 w-10 rounded-full bg-surface3 text-tx-secondary flex items-center justify-center font-semibold text-sm">
                          {getInitials(student.fullName)}
                        </div>
                        <div>
                          <div className="font-medium text-tx-primary">{student.fullName}</div>
                          <div className="text-sm text-tx-muted">{student.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Instructor (locked when preselected) */}
          {preselectedInstructor && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-primary" />
                <label className="block text-sm font-semibold text-tx-primary">Instructor</label>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
                  {getInitials(preselectedInstructor.fullName)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-tx-primary">{preselectedInstructor.fullName}</div>
                  <div className="text-sm text-tx-secondary">{preselectedInstructor.email}</div>
                </div>
              </div>
            </div>
          )}

          {/* Pickup Address */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-amber-600" />
              <label className="block text-sm font-semibold text-tx-primary">
                Pickup Location <span className="text-red-500">*</span>
              </label>
            </div>
            <textarea
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              placeholder="Enter pickup address (include zip code for best results)..."
              rows={2}
              className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
            {pickupZip ? (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Zip code detected: {pickupZip}
              </p>
            ) : pickupAddress && (
              <p className="text-xs text-amber-600">
                ⚠️ No zip code detected. Add a zip code for accurate proximity matching.
              </p>
            )}
          </div>

          {/* Lesson Details Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-tx-secondary mb-2">
                <Calendar className="h-4 w-4 inline mr-1 text-purple-600" />
                Lesson Type
              </label>
              <select
                title="Select lesson type"
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as any)}
                className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="behind_wheel">Behind the Wheel</option>
                <option value="classroom">Classroom</option>
                <option value="observation">Observation</option>
                <option value="road_test">Road Test</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-tx-secondary mb-2">
                <Clock className="h-4 w-4 inline mr-1 text-orange-600" />
                Duration
              </label>
              <select
                title="Select lesson duration"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-orange-500"
              >
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          {/* Time Preference */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-indigo-600" />
              <label className="block text-sm font-semibold text-tx-primary">
                Time Preference (optional)
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'any', label: 'Any Time', icon: null },
                { value: 'morning', label: 'Morning (6am-12pm)', icon: Sun },
                { value: 'afternoon', label: 'Afternoon (12pm-5pm)', icon: Sunset },
                { value: 'evening', label: 'Evening (5pm-9pm)', icon: Moon },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTimePreference(value as TimePreference)}
                  className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                    timePreference === value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)] text-tx-secondary'
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Continue Button */}
          <div className="border-t border-[var(--border)] pt-6 flex space-x-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-6 py-3 border-2 border-[var(--border-strong)] text-tx-secondary rounded-lg hover:bg-surface2 transition-colors font-medium"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleFindSlots}
              disabled={!selectedStudentId || !pickupZip || loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Finding Best Slots...
                </span>
              ) : preselectedInstructor ? (
                'Find Available Times'
              ) : (
                'Find Available Instructors'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Slots with Proximity */}
      {step === 'slots' && (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-tx-primary">Available Time Slots</h3>
              <p className="text-sm text-tx-muted">
                Sorted by instructor proximity to pickup location
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep('setup')}
              className="text-sm text-primary hover:text-blue-800 font-medium"
            >
              ← Change Filters
            </button>
          </div>

          {/* Pickup reminder */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <MapPin className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <span className="font-medium text-amber-800">Pickup:</span>{' '}
              <span className="text-amber-700">{pickupAddress}</span>
            </div>
          </div>

          {/* Non-blocking notice: some instructors' lookups failed but the search still succeeded for the rest */}
          {failedInstructorCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Couldn't check availability for {failedInstructorCount}{' '}
              {failedInstructorCount === 1 ? 'instructor' : 'instructors'}. Showing results from everyone else.
            </div>
          )}

          {slotsWithProximity.length === 0 ? (
            <div className="text-center py-12 text-tx-muted bg-surface2 rounded-lg border-2 border-dashed border-[var(--border-strong)]">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-tx-muted" />
              <p className="font-medium">No available slots found</p>
              <p className="text-sm mt-1">Try changing the duration or time preference</p>
            </div>
          ) : (
            <GroupedAvailabilityView
              slots={slotsWithProximity}
              onSelectSlot={handleSelectSlot}
              formatSlotDate={formatShortDate}
              formatTime={formatTime}
              getProximityBadge={getProximityBadge}
            />
          )}

          {/* Back button */}
          <div className="border-t border-[var(--border)] pt-6">
            <button
              type="button"
              onClick={() => setStep('setup')}
              className="w-full px-6 py-3 border-2 border-[var(--border-strong)] text-tx-secondary rounded-lg hover:bg-surface2 transition-colors font-medium"
            >
              ← Back to Setup
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && selectedSlot && (
        <div className="p-6 space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-tx-primary mb-4 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              Booking Summary
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-tx-secondary">Student</span>
                <span className="font-semibold text-tx-primary">{selectedStudent?.fullName}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-tx-secondary">Instructor</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-tx-primary">{selectedSlot.instructorName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getProximityBadge(selectedSlot.proximityScore).class}`}>
                    {getProximityBadge(selectedSlot.proximityScore).label}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
                <span className="text-sm text-tx-secondary">Date & Time</span>
                <div className="text-right">
                  <div className="font-semibold text-tx-primary">{formatShortDate(selectedSlot.date)}</div>
                  <div className="text-sm text-tx-secondary">
                    {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-tx-secondary">Lesson Type</span>
                <span className="font-semibold text-tx-primary capitalize">{lessonType.replace(/_/g, ' ')}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-tx-secondary">Duration</span>
                <span className="font-semibold text-tx-primary">{duration} minutes</span>
              </div>

              <div className="flex items-start justify-between">
                <span className="text-sm text-tx-secondary">Pickup</span>
                <span className="font-semibold text-tx-primary text-right max-w-xs">{pickupAddress}</span>
              </div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-tx-secondary mb-2">
                Lesson # (auto-suggested)
              </label>
              <select
                title="Select lesson number"
                value={lessonNumber || ''}
                onChange={(e) => setLessonNumber(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Not set</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>Lesson #{num}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-tx-secondary mb-2">
                Cost ($) - Edit for discounts
              </label>
              <input
                type="number"
                title="Lesson cost"
                placeholder="Enter cost"
                value={cost}
                onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                autoComplete="nope"
                className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-tx-secondary mb-2">
              <FileText className="h-4 w-4 inline mr-1" />
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes for the instructor..."
              rows={2}
              className="w-full px-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setStep('slots')}
              className="flex-1 px-6 py-3 border-2 border-[var(--border-strong)] text-tx-secondary rounded-lg hover:bg-surface2 transition-colors font-medium"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleConfirmBooking}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all disabled:opacity-50 font-medium shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Booking...
                </span>
              ) : (
                `Confirm Booking - $${cost.toFixed(2)}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

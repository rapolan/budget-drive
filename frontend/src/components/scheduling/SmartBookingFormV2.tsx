import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, User, Clock, MapPin, CheckCircle, Sparkles, FileText, Sun, Sunset, Moon, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi, instructorsApi } from '@/api';
import { TimeSlot, Student, Instructor, Lesson } from '@/types';
import { ProgressStepper } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { calculateProximityScore, extractZipCode } from '@/utils/zipCode';

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  onBookingComplete?: (lessonId: string) => void;
  onCancel?: () => void;
}

// Extended slot type with proximity info
interface SlotWithProximity extends TimeSlot {
  proximityScore: number;
  instructorName: string;
  instructorZip?: string;
  comingFrom: 'home' | 'lesson';
  previousLessonAddress?: string;
}

type TimePreference = 'any' | 'morning' | 'afternoon' | 'evening';

// Instructor-Based Grouped Availability View Component for SmartBookingFormV2
interface GroupedAvailabilityViewV2Props {
  slots: SlotWithProximity[];
  onSelectSlot: (slot: SlotWithProximity) => void;
  formatSlotDate: (dateStr: string) => string;
  formatTime: (time: string) => string;
  getProximityBadge: (score: number) => { label: string; class: string };
}

const GroupedAvailabilityViewV2: React.FC<GroupedAvailabilityViewV2Props> = ({
  slots,
  onSelectSlot,
  formatSlotDate,
  formatTime,
  getProximityBadge,
}) => {
  const [expandedInstructors, setExpandedInstructors] = useState<Set<number>>(new Set());

  // Group slots by instructor
  const instructorGroups = useMemo(() => {
    const groups = new Map<number, SlotWithProximity[]>();

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

  const toggleInstructor = (instructorId: number) => {
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
      <p className="text-xs text-gray-500">{instructorGroups.length} instructors available (sorted by proximity)</p>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {instructorGroups.map((instructor, index) => {
          const isExpanded = expandedInstructors.has(instructor.instructorId);
          const badge = getProximityBadge(instructor.bestProximityScore);

          return (
            <div key={instructor.instructorId} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
              {/* Instructor Header - Clickable */}
              <button
                type="button"
                onClick={() => toggleInstructor(instructor.instructorId)}
                className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
              >
                {/* Rank indicator */}
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base flex-shrink-0 ${
                  index < 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  #{index + 1}
                </div>

                {/* Instructor info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-base md:text-lg">{instructor.instructorName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.class}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {instructor.totalSlots} available {instructor.totalSlots === 1 ? 'slot' : 'slots'}
                  </div>
                </div>

                {/* Expand/Collapse Icon */}
                <div className="text-gray-400 flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </button>

              {/* Expanded: Show slots grouped by date */}
              {isExpanded && (
                <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                  {instructor.dateGroups.map(dateGroup => (
                    <div key={dateGroup.date}>
                      {/* Date header */}
                      <div className="text-xs font-semibold text-gray-700 mb-2 px-1">
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
                            className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left flex items-center justify-between active:scale-[0.98]"
                          >
                            <span className="text-sm font-medium text-gray-900">
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                            <span className="text-gray-400 text-sm">→</span>
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

export const SmartBookingFormV2: React.FC<SmartBookingFormProps> = ({
  preselectedStudent,
  onBookingComplete,
  onCancel,
}) => {
  // Steps: 'setup' (student, pickup, duration, type) -> 'filter' (date/time prefs) -> 'slots' (ranked slots) -> 'confirm'
  const [step, setStep] = useState<'setup' | 'slots' | 'confirm'>('setup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const { data: allLessonsData } = useQuery({
    queryKey: ['lessons', 'all-for-proximity'],
    queryFn: () => lessonsApi.getAll(1, 500),
  });

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];
  const allLessons = allLessonsData?.data || [];

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
    if (selectedStudentId && allLessons.length > 0) {
      const studentLessons = allLessons.filter(
        (l: Lesson) => l.studentId === selectedStudentId && 
        (l.status === 'completed' || l.status === 'scheduled')
      );
      setLessonNumber(studentLessons.length + 1);
    }
  }, [selectedStudentId, allLessons]);

  // Get instructor's starting location for a specific slot
  const getInstructorStartingPoint = (
    instructorId: string,
    slotDate: string,
    slotStartTime: string
  ): { zip: string | null; comingFrom: 'home' | 'lesson'; previousAddress?: string } => {
    const instructor = instructors.find((i: Instructor) => i.id === instructorId);
    if (!instructor) return { zip: null, comingFrom: 'home' };

    // Parse slot start time
    let slotStartHour: number;
    if (slotStartTime.includes('T')) {
      slotStartHour = new Date(slotStartTime).getHours();
    } else {
      slotStartHour = parseInt(slotStartTime.split(':')[0]);
    }

    // Find all lessons for this instructor on this date that END BEFORE this slot starts
    const lessonsOnDate = allLessons.filter((l: Lesson) => {
      if (l.instructorId !== instructorId) return false;
      
      // Compare dates
      const lessonDate = new Date(l.date).toISOString().split('T')[0];
      if (lessonDate !== slotDate) return false;
      
      // Get lesson end time
      let lessonEndHour: number;
      if (l.endTime) {
        const endParts = l.endTime.split(':');
        lessonEndHour = parseInt(endParts[0]);
      } else {
        return false;
      }
      
      // Lesson must end before or at slot start
      return lessonEndHour <= slotStartHour;
    });

    if (lessonsOnDate.length === 0) {
      // No prior lessons - use instructor's home base zip
      return { 
        zip: instructor.zipCode || null, 
        comingFrom: 'home' 
      };
    }

    // Find the lesson that ends closest to the slot start (most recent before)
    const sortedLessons = lessonsOnDate.sort((a: Lesson, b: Lesson) => {
      const aEnd = parseInt(a.endTime?.split(':')[0] || '0');
      const bEnd = parseInt(b.endTime?.split(':')[0] || '0');
      return bEnd - aEnd; // Descending - latest first
    });

    const previousLesson = sortedLessons[0];
    const previousZip = extractZipCode(previousLesson.pickupAddress);
    
    return {
      zip: previousZip || instructor.zipCode || null,
      comingFrom: 'lesson',
      previousAddress: previousLesson.pickupAddress || undefined
    };
  };

  // Filter slots by time preference
  const filterByTimePreference = (slots: TimeSlot[]): TimeSlot[] => {
    if (timePreference === 'any') return slots;
    
    return slots.filter(slot => {
      let hour: number;
      if (slot.startTime.includes('T')) {
        hour = new Date(slot.startTime).getHours();
      } else {
        hour = parseInt(slot.startTime.split(':')[0]);
      }
      
      switch (timePreference) {
        case 'morning': return hour >= 6 && hour < 12;
        case 'afternoon': return hour >= 12 && hour < 17;
        case 'evening': return hour >= 17 && hour < 21;
        default: return true;
      }
    });
  };

  // Find all available slots across all instructors with proximity
  const handleFindSlots = async () => {
    if (!selectedStudentId || !pickupZip) {
      setError('Please select a student and ensure pickup address has a valid zip code');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + dateRange);

      // Fetch slots for ALL instructors
      const allSlots: SlotWithProximity[] = [];

      for (const instructor of instructors) {
        if (instructor.status !== 'active') continue;

        try {
          const slots = await schedulingApi.findAvailableSlots({
            instructorId: instructor.id,
            startDate: tomorrow.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            duration,
            studentId: selectedStudentId,
          });

          // Filter by time preference
          const filteredSlots = filterByTimePreference(slots.filter(s => s.available));

          // Add proximity info to each slot
          for (const slot of filteredSlots) {
            const { zip, comingFrom, previousAddress } = getInstructorStartingPoint(
              instructor.id,
              slot.date,
              slot.startTime
            );
            
            const proximityScore = calculateProximityScore(zip, pickupZip);
            
            allSlots.push({
              ...slot,
              instructorId: instructor.id,
              instructorName: instructor.fullName,
              instructorZip: zip || undefined,
              proximityScore,
              comingFrom,
              previousLessonAddress: previousAddress,
            });
          }
        } catch (err) {
          // Skip instructor if error fetching slots
          console.warn(`Could not fetch slots for ${instructor.fullName}:`, err);
        }
      }

      // Sort by proximity score (highest first), then by date
      allSlots.sort((a, b) => {
        // Primary: proximity score (descending)
        if (b.proximityScore !== a.proximityScore) {
          return b.proximityScore - a.proximityScore;
        }
        // Secondary: date (ascending)
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      setSlotsWithProximity(allSlots);
      setStep('slots');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to find available slots');
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
      setError(errorMsg);
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
    return { label: '🗺️ Far', class: 'bg-gray-100 text-gray-600' };
  };

  const bookingSteps = [
    { number: 1, label: 'Setup' },
    { number: 2, label: 'Select Slot' },
    { number: 3, label: 'Confirm' },
  ];

  const currentStepNumber = step === 'setup' ? 1 : step === 'slots' ? 2 : 3;

  return (
    <div className="bg-white rounded-lg shadow-xl max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Smart Booking</h2>
              <p className="text-sm text-gray-500">Find the closest available instructor</p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
              <User className="h-5 w-5 text-blue-600" />
              <label className="block text-sm font-semibold text-gray-900">
                Student <span className="text-red-500">*</span>
              </label>
            </div>
            {preselectedStudent ? (
              <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                  {getInitials(preselectedStudent.fullName)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{preselectedStudent.fullName}</div>
                  <div className="text-sm text-gray-600">{preselectedStudent.email}</div>
                </div>
              </div>
            ) : selectedStudent ? (
              <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                  {getInitials(selectedStudent.fullName)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{selectedStudent.fullName}</div>
                  <div className="text-sm text-gray-600">{selectedStudent.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudentId('');
                    setStudentSearch('');
                    setPickupAddress('');
                    setPickupZip(null);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {showStudentDropdown && filteredStudents.length > 0 && (
                  <div className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
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
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 flex items-center space-x-3"
                      >
                        <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-semibold text-sm">
                          {getInitials(student.fullName)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{student.fullName}</div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pickup Address */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-amber-600" />
              <label className="block text-sm font-semibold text-gray-900">
                Pickup Location <span className="text-red-500">*</span>
              </label>
            </div>
            <textarea
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              placeholder="Enter pickup address (include zip code for best results)..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1 text-purple-600" />
                Lesson Type
              </label>
              <select
                title="Select lesson type"
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as any)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="behind_wheel">Behind the Wheel</option>
                <option value="classroom">Classroom</option>
                <option value="observation">Observation</option>
                <option value="road_test">Road Test</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="h-4 w-4 inline mr-1 text-orange-600" />
                Duration
              </label>
              <select
                title="Select lesson duration"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
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
              <label className="block text-sm font-semibold text-gray-900">
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
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Continue Button */}
          <div className="border-t border-gray-200 pt-6 flex space-x-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
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
              <h3 className="text-lg font-semibold text-gray-900">Available Time Slots</h3>
              <p className="text-sm text-gray-500">
                Sorted by instructor proximity to pickup location
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep('setup')}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
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

          {slotsWithProximity.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="font-medium">No available slots found</p>
              <p className="text-sm mt-1">Try changing the duration or time preference</p>
            </div>
          ) : (
            <GroupedAvailabilityViewV2
              slots={slotsWithProximity}
              onSelectSlot={handleSelectSlot}
              formatSlotDate={formatShortDate}
              formatTime={formatTime}
              getProximityBadge={getProximityBadge}
            />
          )}

          {/* Back button */}
          <div className="border-t border-gray-200 pt-6">
            <button
              type="button"
              onClick={() => setStep('setup')}
              className="w-full px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              Booking Summary
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Student</span>
                <span className="font-semibold text-gray-900">{selectedStudent?.fullName}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Instructor</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{selectedSlot.instructorName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getProximityBadge(selectedSlot.proximityScore).class}`}>
                    {getProximityBadge(selectedSlot.proximityScore).label}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <span className="text-sm text-gray-600">Date & Time</span>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{formatShortDate(selectedSlot.date)}</div>
                  <div className="text-sm text-gray-600">
                    {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Lesson Type</span>
                <span className="font-semibold text-gray-900 capitalize">{lessonType.replace(/_/g, ' ')}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Duration</span>
                <span className="font-semibold text-gray-900">{duration} minutes</span>
              </div>

              <div className="flex items-start justify-between">
                <span className="text-sm text-gray-600">Pickup</span>
                <span className="font-semibold text-gray-900 text-right max-w-xs">{pickupAddress}</span>
              </div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lesson # (auto-suggested)
              </label>
              <select
                title="Select lesson number"
                value={lessonNumber || ''}
                onChange={(e) => setLessonNumber(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Not set</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>Lesson #{num}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="h-4 w-4 inline mr-1" />
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes for the instructor..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setStep('slots')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
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

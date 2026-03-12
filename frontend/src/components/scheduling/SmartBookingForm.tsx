import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi, instructorsApi } from '@/api';
import { TimeSlot, Student, Instructor, Lesson } from '@/types';
import { formatShortDate } from '@/utils/timeFormat';
import { getEffectiveZipCode, calculateProximityScore, extractZipCode } from '@/utils/zipCode';

// Grouped Availability View Component
interface GroupedAvailabilityViewProps {
  slots: TimeSlot[];
  onSelectSlot: (slot: TimeSlot) => void;
  formatSlotDate: (dateStr: string) => string;
  formatTime: (time: string) => string;
}

const GroupedAvailabilityView: React.FC<GroupedAvailabilityViewProps> = ({
  slots,
  onSelectSlot,
  formatSlotDate,
  formatTime,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group slots by date
  const groupedSlots = useMemo(() => {
    const groups: { [key: string]: TimeSlot[] } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    slots.forEach(slot => {
      const slotDate = new Date(slot.date);
      slotDate.setHours(0, 0, 0, 0);

      let groupKey: string;
      let groupLabel: string;
      let sortOrder: number;

      if (slotDate.getTime() === today.getTime()) {
        groupKey = 'today';
        groupLabel = `Today (${formatSlotDate(slot.date).split(',')[0]})`;
        sortOrder = 0;
      } else if (slotDate.getTime() === tomorrow.getTime()) {
        groupKey = 'tomorrow';
        groupLabel = `Tomorrow (${formatSlotDate(slot.date).split(',')[0]})`;
        sortOrder = 1;
      } else if (slotDate < nextWeek) {
        groupKey = `thisweek_${slot.date}`;
        groupLabel = formatSlotDate(slot.date);
        sortOrder = 2;
      } else {
        groupKey = `later_${slot.date}`;
        groupLabel = formatSlotDate(slot.date);
        sortOrder = 3;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
        (groups[groupKey] as any).label = groupLabel;
        (groups[groupKey] as any).sortOrder = sortOrder;
      }
      groups[groupKey].push(slot);
    });

    // Convert to array and sort
    return Object.entries(groups)
      .map(([key, slots]) => ({
        key,
        label: (slots as any).label,
        sortOrder: (slots as any).sortOrder,
        slots: slots.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [slots, formatSlotDate]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const MAX_PREVIEW_SLOTS = 3; // Show first 3 slots on mobile, 4 on desktop

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{slots.length} slots available</p>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {groupedSlots.map(group => {
          const isExpanded = expandedGroups.has(group.key);
          const previewSlots = group.slots.slice(0, MAX_PREVIEW_SLOTS);
          const hasMore = group.slots.length > MAX_PREVIEW_SLOTS;

          return (
            <div key={group.key} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              {/* Group Header */}
              <div className="px-4 py-2.5 bg-white border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">{group.label}</h4>
                  <span className="text-xs text-gray-500">
                    {group.slots.length} {group.slots.length === 1 ? 'slot' : 'slots'}
                  </span>
                </div>
              </div>

              {/* Slots - Preview or Full List */}
              <div className="p-3">
                {/* Desktop: Grid layout, Mobile: Stacked */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {(isExpanded ? group.slots : previewSlots).map((slot, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectSlot(slot)}
                      className="p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm transition-all text-left active:scale-95"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {formatTime(slot.startTime)}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatTime(slot.endTime)}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Show More/Less Button */}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="w-full mt-2 py-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        Show Less <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        Show {group.slots.length - MAX_PREVIEW_SLOTS} More <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  preselectedInstructor?: Instructor;
  preselectedDate?: Date;
  preselectedTime?: { start: string; end: string };
  onBookingComplete?: (lessonId: string) => void;
  onCancel?: () => void;
}

export const SmartBookingForm: React.FC<SmartBookingFormProps> = ({
  preselectedStudent,
  preselectedInstructor,
  preselectedDate,
  preselectedTime,
  onBookingComplete,
  onCancel,
}) => {
  // Simplified to 2 steps: 'setup' and 'confirm'
  // Only skip to confirm if ALL required fields are pre-selected (student, instructor, date, time)
  const initialStep = (preselectedStudent && preselectedInstructor && preselectedDate && preselectedTime) ? 'confirm' : 'setup';
  const [step, setStep] = useState<'setup' | 'confirm'>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Form data
  const [selectedInstructorId, setSelectedInstructorId] = useState(preselectedInstructor?.id || '');
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [duration, setDuration] = useState(120); // Default: 2 hours
  const [lessonType, setLessonType] = useState<'behind_wheel' | 'classroom' | 'observation' | 'road_test'>('behind_wheel');
  const [cost, setCost] = useState(150);
  const [pickupAddress, setPickupAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Slot selection
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showingSlots, setShowingSlots] = useState(false);

  // Search states
  const [instructorSearch, setInstructorSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [showInstructorDropdown, setShowInstructorDropdown] = useState(false);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  // Fetch lists - paginate students for better performance
  const { data: studentsData } = useQuery({
    queryKey: ['students', 'booking'],
    queryFn: () => studentsApi.getAll(1, 50), // Fetch only 50 students initially
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  // Fetch recent lessons for instructor location data (for proximity sorting)
  const { data: recentLessonsData } = useQuery({
    queryKey: ['lessons', 'recent-for-proximity'],
    queryFn: () => lessonsApi.getAll(1, 200), // Get recent lessons to determine instructor locations
  });

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];
  const recentLessons = recentLessonsData?.data || [];

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
    // Fall back to legacy address field
    return student.address || '';
  };

  // Get each instructor's most recent lesson pickup address (for proximity sorting)
  const instructorLastLocations = useMemo(() => {
    const locationMap: Record<string, string> = {};
    
    // Sort lessons by date descending to find most recent
    const sortedLessons = [...recentLessons].sort((a: Lesson, b: Lesson) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    // For each instructor, get their most recent lesson's pickup address
    for (const lesson of sortedLessons) {
      if (lesson.instructorId && !locationMap[lesson.instructorId] && lesson.pickupAddress) {
        locationMap[lesson.instructorId] = lesson.pickupAddress;
      }
    }
    
    return locationMap;
  }, [recentLessons]);

  // Get selected student and their assigned instructor
  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find((s: Student) => s.id === selectedStudentId);
  }, [selectedStudentId, students]);

  // Get the target zip code for proximity sorting (from selected student)
  const targetZipCode = useMemo(() => {
    if (!selectedStudent) return null;
    return getEffectiveZipCode(null, selectedStudent.zipCode);
  }, [selectedStudent]);

  // Helper: Check if instructor serves the student's zip code
  const instructorServesArea = (instructor: Instructor, studentZip: string | null): boolean => {
    if (!studentZip || !instructor.serviceZipCodes) return true; // No restrictions

    const serviceAreas = instructor.serviceZipCodes.split(',').map(z => z.trim());

    // Check exact match or prefix match
    return serviceAreas.some(serviceZip => {
      // Exact match
      if (serviceZip === studentZip) return true;
      // Prefix match (e.g., "920" matches "92001")
      if (studentZip.startsWith(serviceZip)) return true;
      if (serviceZip.startsWith(studentZip)) return true;
      return false;
    });
  };

  // Helper: Get proximity indicator badge
  const getProximityBadge = (proximityScore: number) => {
    if (proximityScore >= 90) return { emoji: '🏠', text: 'Very Close', color: 'text-green-600 bg-green-50' };
    if (proximityScore >= 70) return { emoji: '📍', text: 'Same Area', color: 'text-blue-600 bg-blue-50' };
    if (proximityScore >= 50) return { emoji: '🚗', text: 'Nearby', color: 'text-gray-600 bg-gray-50' };
    return { emoji: '🗺️', text: 'Far', color: 'text-orange-600 bg-orange-50' };
  };

  // Sort and filter instructors with proximity scoring and service area filtering
  const filteredInstructors = useMemo(() => {
    let filtered = instructors.filter((i: Instructor) => {
      // Text search filter
      const matchesSearch = i.fullName.toLowerCase().includes(instructorSearch.toLowerCase()) ||
        i.email.toLowerCase().includes(instructorSearch.toLowerCase());
      if (!matchesSearch) return false;

      // Service area filter (only if student is selected and instructor has service areas defined)
      if (selectedStudent && targetZipCode && i.serviceZipCodes) {
        const servesArea = instructorServesArea(i, targetZipCode);
        if (!servesArea) return false; // Filter out instructors who don't serve this area
      }

      return true;
    });

    // Calculate proximity score and add metadata
    filtered = filtered.map((instructor: Instructor) => {
      // Use home_zip_code if available, otherwise fall back to last lesson location
      const instructorZip = instructor.homeZipCode || extractZipCode(instructorLastLocations[instructor.id]);
      const proximityScore = calculateProximityScore(instructorZip, targetZipCode);
      const badge = getProximityBadge(proximityScore);

      return {
        ...instructor,
        proximityScore,
        proximityBadge: badge,
        instructorZip,
        isAssignedInstructor: selectedStudent?.assignedInstructorId === instructor.id
      };
    });

    // Sort: Assigned instructor first, then by proximity
    filtered.sort((a: any, b: any) => {
      // Assigned instructor always first
      if (a.isAssignedInstructor && !b.isAssignedInstructor) return -1;
      if (!a.isAssignedInstructor && b.isAssignedInstructor) return 1;

      // Then sort by proximity score
      return (b.proximityScore || 50) - (a.proximityScore || 50);
    });

    return filtered;
  }, [instructors, instructorSearch, targetZipCode, selectedStudent, instructorLastLocations]);

  const filteredStudents = students.filter((s: Student) =>
    s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // Get display names
  const getInstructorDisplay = (instructor: Instructor) => {
    const duplicates = instructors.filter(i => i.fullName === instructor.fullName);
    if (duplicates.length > 1) {
      return `${instructor.fullName} (${instructor.email})`;
    }
    return instructor.fullName;
  };

  const getStudentDisplay = (student: Student) => {
    const duplicates = students.filter(s => s.fullName === student.fullName);
    if (duplicates.length > 1) {
      return `${student.fullName} (${student.email})`;
    }
    return student.fullName;
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Initialize search fields with preselected values
  useEffect(() => {
    if (preselectedInstructor) {
      setInstructorSearch(getInstructorDisplay(preselectedInstructor));
    }
  }, [preselectedInstructor, instructors]);

  useEffect(() => {
    if (preselectedStudent) {
      setStudentSearch(getStudentDisplay(preselectedStudent));
    }
  }, [preselectedStudent, students]);

  // Initialize selectedSlot with preselected date/time
  useEffect(() => {
    if (preselectedDate && preselectedTime) {
      // Format date as YYYY-MM-DD in local timezone (not UTC)
      const year = preselectedDate.getFullYear();
      const month = String(preselectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(preselectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      setSelectedSlot({
        instructorId: selectedInstructorId,
        date: dateStr,
        startTime: preselectedTime.start,
        endTime: preselectedTime.end,
        available: true,
      });

      // Pre-fill pickup address with student's home address if student is selected
      if (selectedStudentId) {
        const student = students.find((s: Student) => s.id === selectedStudentId);
        if (student) {
          const fullAddress = getStudentFullAddress(student);
          if (fullAddress) {
            setPickupAddress(fullAddress);
          }
        }
      }
    }
  }, [preselectedDate, preselectedTime, selectedStudentId, students, selectedInstructorId]);

  const handleFindSlots = async () => {
    if (!selectedInstructorId) {
      setError('Please select an instructor first');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const twoWeeksLater = new Date();
      twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

      const slots = await schedulingApi.findAvailableSlots({
        instructorId: selectedInstructorId,
        startDate: tomorrow.toISOString().split('T')[0],
        endDate: twoWeeksLater.toISOString().split('T')[0],
        duration,
        studentId: selectedStudentId || undefined,
      });

      setAvailableSlots(slots.filter(s => s.available));
      setShowingSlots(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to find available slots');
      console.error('Error finding slots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlot = async (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setShowingSlots(false);

    // Pre-fill pickup address with student's home address
    if (selectedStudentId && !pickupAddress) {
      const student = students.find((s: Student) => s.id === selectedStudentId);
      if (student) {
        const fullAddress = getStudentFullAddress(student);
        if (fullAddress) {
          setPickupAddress(fullAddress);
        }
      }
    }
  };

  // Parse API error to get user-friendly conflict message
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

  const handleContinueToConfirm = async () => {
    if (!selectedStudentId) {
      setError('Please select a student');
      return;
    }
    if (!selectedInstructorId) {
      setError('Please select an instructor');
      return;
    }
    if (!selectedSlot) {
      setError('Please select a time slot');
      return;
    }

    // Clear previous warnings and proceed to confirm step
    // Conflicts will be checked during final booking
    setError(null);
    setConflictWarning(null);
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;

    try {
      setLoading(true);
      setError(null);

      // Parse date and times from the selected slot
      // Backend expects scheduledStart and scheduledEnd as ISO datetime strings
      // Handle both ISO datetime strings and HH:MM time format from the slot
      const dateStr = selectedSlot.date; // Already in YYYY-MM-DD format
      
      let scheduledStart: string;
      let scheduledEnd: string;
      
      if (selectedSlot.startTime.includes('T')) {
        // startTime is already an ISO datetime string - use it directly
        scheduledStart = selectedSlot.startTime;
        scheduledEnd = selectedSlot.endTime;
      } else {
        // startTime is HH:MM format - construct datetime string
        scheduledStart = `${dateStr}T${selectedSlot.startTime}:00`;
        scheduledEnd = `${dateStr}T${selectedSlot.endTime}:00`;
      }

      const lessonData: any = {
        studentId: selectedStudentId,
        instructorId: selectedInstructorId,
        vehicleId: null,
        scheduledStart: scheduledStart,
        scheduledEnd: scheduledEnd,
        lessonType,
        cost,
        pickupAddress: pickupAddress || null,
        notes: notes || null,
      };

      const lesson = await lessonsApi.create(lessonData);
      onBookingComplete?.(lesson.data?.id || '');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create lesson';
      const friendlyMessage = getConflictMessage(errorMsg);
      setError(friendlyMessage);
      console.error('Error creating lesson:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    // Handle both ISO datetime strings and HH:MM format
    let hour: number, minutes: string;

    if (time.includes('T')) {
      // ISO datetime string
      const date = new Date(time);
      hour = date.getHours();
      minutes = date.getMinutes().toString().padStart(2, '0');
    } else {
      // HH:MM format
      const parts = time.split(':');
      hour = parseInt(parts[0]);
      minutes = parts[1];
    }

    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Use centralized date formatting utility that handles local timezone correctly
  const formatSlotDate = (dateStr: string) => {
    return formatShortDate(dateStr);
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg max-w-2xl mx-auto overflow-hidden">
      {/* Header - Clean & Minimal */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Book a Lesson</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 'setup' ? 'Select student, instructor & time' : 'Review and confirm'}
            </p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Minimal Step Indicator */}
        <div className="flex items-center gap-2 mt-4">
          <div className={`h-1 flex-1 rounded-full transition-colors ${step === 'setup' || step === 'confirm' ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step === 'confirm' ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
      </div>

      {/* Error Display - Minimal */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 rounded-lg px-4 py-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Step 1: Setup */}
      {step === 'setup' && (
        <div className="p-6 space-y-5">
          {/* Student & Instructor Selection - Clean Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Student Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Student {!preselectedStudent && <span className="text-red-500">*</span>}
              </label>
              {preselectedStudent ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium text-sm">
                    {getInitials(preselectedStudent.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{preselectedStudent.fullName}</div>
                    <div className="text-sm text-gray-500 truncate">{preselectedStudent.email}</div>
                  </div>
                </div>
              ) : selectedStudentId && selectedStudent ? (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium text-sm">
                    {getInitials(selectedStudent.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{selectedStudent.fullName}</div>
                    <div className="text-sm text-gray-500 truncate">{selectedStudent.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId('');
                      setStudentSearch('');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-white transition-colors"
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
                    placeholder="Search students..."
                    autoComplete="nope"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
                  />
                  {showStudentDropdown && studentSearch && filteredStudents.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {filteredStudents.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setStudentSearch(getStudentDisplay(student));
                            setShowStudentDropdown(false);
                            const fullAddress = getStudentFullAddress(student);
                            if (fullAddress) {
                              setPickupAddress(fullAddress);
                            }
                          }}
                          className="w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
                        >
                          <div className="h-8 w-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-medium text-xs">
                            {getInitials(student.fullName)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">{student.fullName}</div>
                            <div className="text-xs text-gray-500 truncate">{student.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instructor Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instructor {!preselectedInstructor && <span className="text-red-500">*</span>}
              </label>
              {preselectedInstructor ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-medium text-sm">
                    {getInitials(preselectedInstructor.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{preselectedInstructor.fullName}</div>
                    <div className="text-sm text-gray-500 truncate">{preselectedInstructor.email}</div>
                  </div>
                </div>
              ) : selectedInstructorId && selectedInstructor ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-medium text-sm">
                    {getInitials(selectedInstructor.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{selectedInstructor.fullName}</div>
                    <div className="text-sm text-gray-500 truncate">{selectedInstructor.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInstructorId('');
                      setInstructorSearch('');
                      setAvailableSlots([]);
                      setSelectedSlot(null);
                      setShowingSlots(false);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-white transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={instructorSearch}
                    onChange={(e) => {
                      setInstructorSearch(e.target.value);
                      setShowInstructorDropdown(true);
                    }}
                    onFocus={() => setShowInstructorDropdown(true)}
                    placeholder="Search instructors..."
                    autoComplete="nope"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
                  />
                  {showInstructorDropdown && filteredInstructors.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {targetZipCode && (
                        <div className="px-3 py-2 bg-gray-50 text-xs text-gray-600 flex items-center gap-1 border-b border-gray-100">
                          <MapPin className="h-3 w-3" />
                          Sorted by proximity
                        </div>
                      )}
                      {filteredInstructors.map((instructor: any) => (
                        <button
                          key={instructor.id}
                          type="button"
                          onClick={() => {
                            setSelectedInstructorId(instructor.id);
                            setInstructorSearch(getInstructorDisplay(instructor));
                            setShowInstructorDropdown(false);
                          }}
                          className={`w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                            instructor.isAssignedInstructor ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center font-medium text-xs ${
                            instructor.isAssignedInstructor ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {getInitials(instructor.fullName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-gray-900 text-sm truncate">{instructor.fullName}</span>
                              {instructor.isAssignedInstructor && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  Assigned
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{instructor.email}</div>
                          </div>
                          {targetZipCode && instructor.proximityBadge && (
                            <span className={`text-xs px-2 py-1 rounded-md font-medium ${instructor.proximityBadge.color} whitespace-nowrap`}>
                              <span className="mr-1">{instructor.proximityBadge.emoji}</span>
                              {instructor.proximityBadge.text}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lesson Details - Inline Row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="duration-select" className="block text-sm font-medium text-gray-700 mb-2">
                Duration
              </label>
              <select
                id="duration-select"
                title="Select lesson duration"
                value={duration}
                onChange={(e) => {
                  setDuration(parseInt(e.target.value));
                  setSelectedSlot(null);
                  setAvailableSlots([]);
                  setShowingSlots(false);
                }}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
              >
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            <div>
              <label htmlFor="lesson-type-select" className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                id="lesson-type-select"
                title="Select lesson type"
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
              >
                <option value="behind_wheel">Driving</option>
                <option value="classroom">Classroom</option>
                <option value="road_test_prep">Test Prep</option>
              </select>
            </div>

            <div>
              <label htmlFor="cost-input" className="block text-sm font-medium text-gray-700 mb-2">
                Cost
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  id="cost-input"
                  type="number"
                  title="Enter lesson cost"
                  placeholder="50"
                  value={cost}
                  onChange={(e) => setCost(parseFloat(e.target.value))}
                  min="0"
                  step="0.01"
                  autoComplete="nope"
                  className="w-full pl-7 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Time Slot Selection - Clean */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">
                Date & Time <span className="text-red-500">*</span>
              </label>
              {!selectedSlot && (
                <button
                  type="button"
                  onClick={handleFindSlots}
                  disabled={loading || !selectedInstructorId}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Finding...
                    </span>
                  ) : (
                    'Find Times'
                  )}
                </button>
              )}
            </div>

            {selectedSlot ? (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {formatSlotDate(selectedSlot.date)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(null);
                    setShowingSlots(true);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-white transition-colors"
                >
                  Change
                </button>
              </div>
            ) : showingSlots && availableSlots.length > 0 ? (
              <GroupedAvailabilityView
                slots={availableSlots}
                onSelectSlot={handleSelectSlot}
                formatSlotDate={formatSlotDate}
                formatTime={formatTime}
              />
            ) : showingSlots && availableSlots.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl">
                <p className="text-sm">No available slots found</p>
                <p className="text-xs mt-1 text-gray-400">Try a different duration or instructor</p>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select an instructor, then find available times</p>
              </div>
            )}
          </div>

          {/* Pickup & Notes - Compact */}
          {selectedSlot && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pickup Location
                </label>
                <input
                  type="text"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="Enter pickup address..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Focus areas, special requests..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
                />
              </div>
            </div>
          )}

          {/* Conflict Warning - Minimal */}
          {conflictWarning && (
            <div className="bg-amber-50 rounded-xl px-4 py-3">
              <p className="text-amber-700 text-sm">{conflictWarning}</p>
            </div>
          )}

          {/* Continue Button - Clean */}
          <div className="pt-4 border-t border-gray-100 flex gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleContinueToConfirm}
              disabled={!selectedStudentId || !selectedInstructorId || !selectedSlot}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Confirm - Clean Summary */}
      {step === 'confirm' && selectedSlot && (
        <div className="p-6 space-y-5">
          {/* Summary Card */}
          <div className="bg-gray-50 rounded-xl p-5 space-y-4">
            {/* People Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedStudent && (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium text-xs">
                      {getInitials(selectedStudent.fullName)}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{selectedStudent.fullName}</span>
                  </div>
                )}
                <span className="text-gray-300">→</span>
                {selectedInstructor && (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-medium text-xs">
                      {getInitials(selectedInstructor.fullName)}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{selectedInstructor.fullName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Date & Time */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-gray-900">{formatSlotDate(selectedSlot.date)}</div>
                <div className="text-sm text-gray-500">
                  {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)} ({duration} min)
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 text-sm">
              <div>
                <span className="text-gray-500">Type</span>
                <p className="font-medium text-gray-900 capitalize">{lessonType.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <span className="text-gray-500">Cost</span>
                <p className="font-semibold text-emerald-600">${cost.toFixed(2)}</p>
              </div>
              {pickupAddress && (
                <div className="col-span-2">
                  <span className="text-gray-500">Pickup</span>
                  <p className="font-medium text-gray-900 truncate">{pickupAddress}</p>
                </div>
              )}
              {notes && (
                <div className="col-span-2">
                  <span className="text-gray-500">Notes</span>
                  <p className="text-gray-700">{notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('setup')}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirmBooking}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Booking...
                </span>
              ) : (
                'Confirm Booking'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

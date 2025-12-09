import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, User, Clock, MapPin, CheckCircle, Sparkles, FileText } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi, instructorsApi } from '@/api';
import { TimeSlot, Student, Instructor, Lesson } from '@/types';
import { ProgressStepper } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { getEffectiveZipCode, calculateProximityScore, extractZipCode } from '@/utils/zipCode';

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
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Form data
  const [selectedInstructorId, setSelectedInstructorId] = useState(preselectedInstructor?.id || '');
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [duration, setDuration] = useState(120); // Default: 2 hours
  const [lessonType, setLessonType] = useState<'behind_wheel' | 'classroom' | 'observation' | 'road_test'>('behind_wheel');
  const [cost, setCost] = useState(50);
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

  // Get the target zip code for proximity sorting (from selected student)
  const targetZipCode = useMemo(() => {
    if (!selectedStudentId) return null;
    const student = students.find((s: Student) => s.id === selectedStudentId);
    if (!student) return null;
    return getEffectiveZipCode(null, student.zipCode);
  }, [selectedStudentId, students]);

  // Sort and filter instructors with proximity scoring
  const filteredInstructors = useMemo(() => {
    let filtered = instructors.filter((i: Instructor) =>
      i.fullName.toLowerCase().includes(instructorSearch.toLowerCase()) ||
      i.email.toLowerCase().includes(instructorSearch.toLowerCase())
    );

    // If we have a target zip code, sort by proximity
    if (targetZipCode) {
      filtered = filtered.map((instructor: Instructor) => {
        const lastLocation = instructorLastLocations[instructor.id];
        const lastZip = extractZipCode(lastLocation);
        const proximityScore = calculateProximityScore(lastZip, targetZipCode);
        return { ...instructor, proximityScore, lastLocation };
      }).sort((a: any, b: any) => (b.proximityScore || 50) - (a.proximityScore || 50));
    }

    return filtered;
  }, [instructors, instructorSearch, targetZipCode, instructorLastLocations]);

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
      // We create datetime strings without timezone conversion to preserve local time
      const dateStr = selectedSlot.date; // Already in YYYY-MM-DD format
      const scheduledStart = `${dateStr}T${selectedSlot.startTime}:00`;
      const scheduledEnd = `${dateStr}T${selectedSlot.endTime}:00`;

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

  const selectedStudent = students.find((s: Student) => s.id === selectedStudentId);
  const selectedInstructor = instructors.find((i: Instructor) => i.id === selectedInstructorId);

  const bookingSteps = [
    { number: 1, label: 'Setup' },
    { number: 2, label: 'Confirm' },
  ];

  const currentStepNumber = step === 'setup' ? 1 : 2;

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
              <h2 className="text-2xl font-bold text-gray-900">Book a Lesson</h2>
              <p className="text-sm text-gray-500">Smart booking with availability</p>
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

        {/* Progress Stepper */}
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
          {/* Student & Instructor Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Student Selection */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 mb-3">
                <User className="h-5 w-5 text-blue-600" />
                <label className="block text-sm font-semibold text-gray-900">
                  Student {!preselectedStudent && <span className="text-red-500">*</span>}
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
              ) : selectedStudentId && selectedStudent ? (
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  {showStudentDropdown && studentSearch && filteredStudents.length > 0 && (
                    <div className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
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

            {/* Instructor Selection */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 mb-3">
                <User className="h-5 w-5 text-green-600" />
                <label className="block text-sm font-semibold text-gray-900">
                  Instructor {!preselectedInstructor && <span className="text-red-500">*</span>}
                </label>
              </div>
              {preselectedInstructor ? (
                <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="h-12 w-12 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold">
                    {getInitials(preselectedInstructor.fullName)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{preselectedInstructor.fullName}</div>
                    <div className="text-sm text-gray-600">{preselectedInstructor.email}</div>
                  </div>
                </div>
              ) : selectedInstructorId && selectedInstructor ? (
                <div className="flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="h-12 w-12 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold">
                    {getInitials(selectedInstructor.fullName)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{selectedInstructor.fullName}</div>
                    <div className="text-sm text-gray-600">{selectedInstructor.email}</div>
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
                    className="text-sm text-green-600 hover:text-green-800 font-medium"
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
                    placeholder="Search by name or email..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                  {showInstructorDropdown && instructorSearch && filteredInstructors.length > 0 && (
                    <div className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                      {targetZipCode && (
                        <div className="px-4 py-2 bg-green-50 border-b border-green-100 text-xs text-green-700 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Sorted by proximity to student location
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
                          className="w-full px-4 py-3 text-left hover:bg-green-50 transition-colors border-b border-gray-100 last:border-0 flex items-center space-x-3"
                        >
                          <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-semibold text-sm">
                            {getInitials(instructor.fullName)}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{instructor.fullName}</div>
                            <div className="text-sm text-gray-500">{instructor.email}</div>
                          </div>
                          {targetZipCode && instructor.proximityScore !== undefined && (
                            <div className={`text-xs px-2 py-1 rounded-full ${
                              instructor.proximityScore >= 80 ? 'bg-green-100 text-green-700' :
                              instructor.proximityScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {instructor.proximityScore >= 80 ? '📍 Nearby' :
                               instructor.proximityScore >= 60 ? '~Close' :
                               'Farther'}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lesson Details */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Calendar className="h-5 w-5 text-purple-600 mr-2" />
              Lesson Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>

              <div>
                <label htmlFor="lesson-type-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Lesson Type
                </label>
                <select
                  id="lesson-type-select"
                  title="Select lesson type"
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value as any)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="behind_wheel">Behind the Wheel</option>
                  <option value="classroom">Classroom</option>
                  <option value="observation">Observation</option>
                  <option value="road_test">Road Test</option>
                </select>
              </div>

              <div>
                <label htmlFor="cost-input" className="block text-sm font-medium text-gray-700 mb-2">
                  Cost ($)
                </label>
                <input
                  id="cost-input"
                  type="number"
                  title="Enter lesson cost"
                  placeholder="50.00"
                  value={cost}
                  onChange={(e) => setCost(parseFloat(e.target.value))}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {/* Time Slot Selection */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Clock className="h-5 w-5 text-orange-600 mr-2" />
                Select Time
              </h3>
              {!selectedSlot && (
                <button
                  type="button"
                  onClick={handleFindSlots}
                  disabled={loading || !selectedInstructorId}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md hover:shadow-lg"
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
                    'Find Available Times'
                  )}
                </button>
              )}
            </div>

            {selectedSlot ? (
              <div className="p-6 bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-300 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Selected Time</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatSlotDate(selectedSlot.date)}
                    </div>
                    <div className="text-lg text-gray-700 mt-1">
                      {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSlot(null);
                      setShowingSlots(true);
                    }}
                    className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-white rounded-lg transition-colors font-medium"
                  >
                    Change Time
                  </button>
                </div>
              </div>
            ) : showingSlots && availableSlots.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">
                  Found {availableSlots.length} available time slots
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-2">
                  {availableSlots.slice(0, 30).map((slot, index) => {
                    // Count how many slots are on the same date
                    const slotsOnSameDate = availableSlots.filter(s => s.date === slot.date).length;
                    const isFirstSlotOfDate = availableSlots.findIndex(s => s.date === slot.date) === index;

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group relative"
                      >
                        {isFirstSlotOfDate && slotsOnSameDate > 0 && (
                          <div className="absolute top-2 right-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              {slotsOnSameDate} avail
                            </span>
                          </div>
                        )}
                        <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 pr-16">
                          {formatSlotDate(slot.date)}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {availableSlots.length > 30 && (
                  <div className="text-sm text-center text-gray-500 pt-2">
                    Showing first 30 slots. Select one to continue.
                  </div>
                )}
              </div>
            ) : showingSlots && availableSlots.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium">No available slots found</p>
                <p className="text-sm mt-1">Try changing the duration or selecting a different instructor</p>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium">Click "Find Available Times" to see open slots</p>
              </div>
            )}
          </div>

          {/* Pickup Address */}
          {selectedSlot && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center space-x-2 mb-3">
                <MapPin className="h-5 w-5 text-amber-600" />
                <label className="block text-sm font-semibold text-gray-900">
                  Pickup Location
                </label>
              </div>
              <textarea
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Enter pickup address for this lesson..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">
                This is where the instructor will pick up the student. Defaults to student's home address.
              </p>
            </div>
          )}

          {/* Notes */}
          {selectedSlot && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center space-x-2 mb-3">
                <FileText className="h-5 w-5 text-purple-600" />
                <label className="block text-sm font-semibold text-gray-900">
                  Lesson Notes
                </label>
                <span className="text-xs text-gray-400">(optional)</span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes for the instructor (e.g., focus areas, special requests, student needs)..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">
                📅 These notes will appear in the instructor's calendar event.
              </p>
            </div>
          )}

          {/* Conflict Warning */}
          {conflictWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-yellow-800">Scheduling Conflict</h4>
                  <p className="mt-1 text-sm text-yellow-700">{conflictWarning}</p>
                </div>
              </div>
            </div>
          )}

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
              onClick={handleContinueToConfirm}
              disabled={!selectedStudentId || !selectedInstructorId || !selectedSlot || checkingConflicts}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {checkingConflicts ? 'Checking...' : 'Continue to Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 'confirm' && selectedSlot && (
        <div className="p-6 space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              Booking Summary
            </h3>

            <div className="space-y-4">
              {/* Student */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Student</span>
                <div className="flex items-center space-x-2">
                  {selectedStudent && (
                    <>
                      <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-xs">
                        {getInitials(selectedStudent.fullName)}
                      </div>
                      <span className="font-semibold text-gray-900">{selectedStudent.fullName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Instructor */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Instructor</span>
                <div className="flex items-center space-x-2">
                  {selectedInstructor && (
                    <>
                      <div className="h-8 w-8 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold text-xs">
                        {getInitials(selectedInstructor.fullName)}
                      </div>
                      <span className="font-semibold text-gray-900">{selectedInstructor.fullName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <span className="text-sm text-gray-600">Date & Time</span>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{formatSlotDate(selectedSlot.date)}</div>
                  <div className="text-sm text-gray-600">
                    {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
                  </div>
                </div>
              </div>

              {/* Lesson Details */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Duration</span>
                <span className="font-semibold text-gray-900">{duration} minutes</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Lesson Type</span>
                <span className="font-semibold text-gray-900 capitalize">{lessonType.replace(/_/g, ' ')}</span>
              </div>

              {/* Pickup Address */}
              {pickupAddress && (
                <div className="flex items-start justify-between">
                  <span className="text-sm text-gray-600">Pickup Location</span>
                  <span className="font-semibold text-gray-900 text-right max-w-xs">{pickupAddress}</span>
                </div>
              )}

              {/* Notes */}
              {notes && (
                <div className="flex items-start justify-between">
                  <span className="text-sm text-gray-600">Notes</span>
                  <span className="font-medium text-gray-700 text-right max-w-xs text-sm">{notes}</span>
                </div>
              )}

              {/* Cost */}
              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <span className="text-sm text-gray-600">Lesson Cost</span>
                <span className="text-2xl font-bold text-green-600">${cost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 flex items-center text-sm">
              <CheckCircle className="h-5 w-5 mr-2" />
              Everything looks good! Ready to confirm this booking.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => setStep('setup')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Go Back
            </button>
            <button
              type="button"
              onClick={handleConfirmBooking}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
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

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, List } from 'lucide-react';
import { schedulingApi, lessonsApi, studentsApi, instructorsApi } from '@/api';
import { TimeSlot, SchedulingConflict, Student, Instructor } from '@/types';
import { WeeklySlotView } from './WeeklySlotView';

interface SmartBookingFormProps {
  preselectedStudent?: Student;
  preselectedInstructor?: Instructor;
  onBookingComplete?: (lessonId: string) => void;
  onCancel?: () => void;
}

export const SmartBookingForm: React.FC<SmartBookingFormProps> = ({
  preselectedStudent,
  preselectedInstructor,
  onBookingComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<'select' | 'slots' | 'details' | 'confirm'>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotViewMode, setSlotViewMode] = useState<'list' | 'calendar'>('calendar');

  // Form data
  const [selectedInstructorId, setSelectedInstructorId] = useState(
    preselectedInstructor?.id || ''
  );
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [duration, setDuration] = useState(60);
  const [lessonType, setLessonType] = useState<'behind_wheel' | 'classroom' | 'observation' | 'road_test'>('behind_wheel');
  const [cost, setCost] = useState(50);
  const [pickupAddress, setPickupAddress] = useState('');

  // Payment data
  const [payNow, setPayNow] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'check' | 'other'>('cash');

  // Search states
  const [instructorSearch, setInstructorSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Dropdown visibility
  const [showInstructorDropdown, setShowInstructorDropdown] = useState(false);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  // Fetch lists
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: studentsApi.getAll,
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: instructorsApi.getAll,
  });

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];

  // Filter based on search
  const filteredInstructors = instructors.filter(i =>
    i.fullName.toLowerCase().includes(instructorSearch.toLowerCase()) ||
    i.email.toLowerCase().includes(instructorSearch.toLowerCase())
  );

  const filteredStudents = students.filter(s =>
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

  // Update payment amount when cost changes
  useEffect(() => {
    if (payNow) {
      setPaymentAmount(cost);
    }
  }, [cost, payNow]);

  // Slot finding
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow (respects 24hr advance booking)
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 weeks from now
  });
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Conflict checking
  const [conflicts, setConflicts] = useState<SchedulingConflict[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);

  const handleFindSlots = async () => {
    if (!selectedInstructorId) {
      setError('Please select an instructor');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const slots = await schedulingApi.findAvailableSlots({
        instructorId: selectedInstructorId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        duration,
        studentId: selectedStudentId || undefined,
      });

      setAvailableSlots(slots.filter(s => s.available));
      setStep('slots');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to find available slots');
      console.error('Error finding slots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlot = async (slot: TimeSlot) => {
    if (!selectedStudentId) {
      setError('Please select a student before choosing a time slot');
      return;
    }

    setSelectedSlot(slot);

    // Pre-fill pickup address with student's home address
    const student = students.find(s => s.id === selectedStudentId);
    if (student && student.address) {
      setPickupAddress(student.address);
    }

    // Check for conflicts
    try {
      setLoading(true);
      setError(null);
      const conflictList = await schedulingApi.checkConflicts({
        instructorId: selectedInstructorId,
        vehicleId: null,
        studentId: selectedStudentId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });

      setConflicts(conflictList);
      setShowConflicts(conflictList.length > 0);

      if (conflictList.length === 0) {
        setStep('details');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to check conflicts');
      console.error('Error checking conflicts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;

    try {
      setLoading(true);
      setError(null);

      const lessonData = {
        studentId: selectedStudentId,
        instructorId: selectedInstructorId,
        vehicleId: null, // Vehicle will be assigned separately
        scheduledStart: selectedSlot.startTime,
        scheduledEnd: selectedSlot.endTime,
        duration,
        lessonType,
        cost,
        pickupAddress: pickupAddress || null, // Lesson-specific pickup address
        // Payment data - will be used once backend supports it
        // TODO: Backend needs to support payment data on lesson creation
        ...(payNow && {
          payment: {
            amount: paymentAmount,
            method: paymentMethod,
            paidAt: new Date().toISOString(),
          }
        }),
      };

      const lesson = await lessonsApi.create(lessonData);
      onBookingComplete?.(lesson.data?.id || '');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create lesson');
      console.error('Error creating lesson:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatSlotTime = (slot: TimeSlot): string => {
    const date = new Date(slot.date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    // Format the time from ISO 8601 to readable format
    const startTime = new Date(slot.startTime);
    const endTime = new Date(slot.endTime);
    const formatTime = (date: Date) => {
      const hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `${displayHours}:${displayMinutes} ${ampm}`;
    };

    return `${dayName}, ${formattedDate} at ${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  const getConflictIcon = (type: string): string => {
    switch (type) {
      case 'instructor_busy':
        return '👨‍🏫';
      case 'vehicle_busy':
        return '🚗';
      case 'student_busy':
        return '👤';
      case 'time_off':
        return '🏖️';
      case 'outside_working_hours':
        return '⏰';
      case 'buffer_violation':
        return '⚡';
      default:
        return '⚠️';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">Smart Lesson Booking</h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors text-xl"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Step 1: Selection */}
      {step === 'select' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Instructor Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructor *
              </label>
              {preselectedInstructor ? (
                <div className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-gray-700">
                  {getInstructorDisplay(preselectedInstructor)}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {showInstructorDropdown && instructorSearch && filteredInstructors.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredInstructors.map((instructor) => (
                        <button
                          key={instructor.id}
                          type="button"
                          onClick={() => {
                            setSelectedInstructorId(instructor.id);
                            setInstructorSearch(getInstructorDisplay(instructor));
                            setShowInstructorDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                        >
                          <div className="font-medium text-gray-900">{instructor.fullName}</div>
                          <div className="text-sm text-gray-500">{instructor.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Student Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Student *
              </label>
              {preselectedStudent ? (
                <div className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-gray-700">
                  {getStudentDisplay(preselectedStudent)}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {showStudentDropdown && studentSearch && filteredStudents.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredStudents.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setStudentSearch(getStudentDisplay(student));
                            setShowStudentDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                        >
                          <div className="font-medium text-gray-900">{student.fullName}</div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (minutes)
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lesson Type
              </label>
              <select
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="behind_wheel">Behind the Wheel</option>
                <option value="classroom">Classroom</option>
                <option value="observation">Observation</option>
                <option value="road_test">Road Test</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost ($)
              </label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(parseFloat(e.target.value))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Date Range</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleFindSlots}
            disabled={loading || !selectedInstructorId}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Finding Slots...' : 'Find Available Slots'}
          </button>
        </div>
      )}

      {/* Step 2: Slot Selection */}
      {step === 'slots' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">
              Available Time Slots ({availableSlots.length})
            </h3>
            <div className="flex items-center space-x-3">
              {/* View Toggle */}
              <div className="flex rounded-md border border-gray-300 bg-white">
                <button
                  onClick={() => setSlotViewMode('list')}
                  className={`flex items-center px-3 py-2 text-sm font-medium transition-colors ${
                    slotViewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSlotViewMode('calendar')}
                  className={`flex items-center px-3 py-2 text-sm font-medium transition-colors ${
                    slotViewMode === 'calendar'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Calendar view"
                >
                  <Calendar className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => setStep('select')}
                className="px-3 py-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
              >
                ← Change Criteria
              </button>
            </div>
          </div>

          {availableSlots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available slots found in the selected date range. Try adjusting your criteria.
            </div>
          ) : (
            <>
              {/* Calendar View */}
              {slotViewMode === 'calendar' && (
                <WeeklySlotView
                  availableSlots={availableSlots}
                  onSelectSlot={handleSelectSlot}
                  selectedSlot={selectedSlot}
                />
              )}

              {/* List View */}
              {slotViewMode === 'list' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                  {availableSlots.map((slot, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectSlot(slot)}
                      className={`p-4 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left ${
                        selectedSlot &&
                        selectedSlot.date === slot.date &&
                        selectedSlot.startTime === slot.startTime
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="font-semibold text-gray-900">
                        {formatSlotTime(slot)}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {slot.startTime} - {slot.endTime}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Conflict Warning Modal */}
      {showConflicts && conflicts.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-900 mb-3">
            ⚠️ Scheduling Conflicts Detected
          </h3>
          <ul className="space-y-2">
            {conflicts.map((conflict, index) => (
              <li key={index} className="flex items-start space-x-2 text-yellow-800">
                <span className="text-xl">{getConflictIcon(conflict.type)}</span>
                <span className="text-sm">{conflict.message}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setShowConflicts(false);
              setStep('slots');
            }}
            className="mt-4 w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
          >
            Choose Another Time Slot
          </button>
        </div>
      )}

      {/* Step 3: Booking Details */}
      {step === 'details' && selectedSlot && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Booking Details</h3>

          {/* Scheduled Time */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <span className="text-2xl mr-3">📅</span>
              <div>
                <div className="text-sm text-gray-600 font-medium">Scheduled Time</div>
                <div className="text-lg font-bold text-gray-900">{formatSlotTime(selectedSlot)}</div>
                <div className="text-sm text-gray-600">{duration} minutes • {lessonType.replace(/_/g, ' ')}</div>
              </div>
            </div>
          </div>

          {/* Student Details */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-2xl mr-3">👤</span>
              <div className="flex-1">
                <div className="text-sm text-gray-600 font-medium mb-2">Student Information</div>
                {(() => {
                  const student = students.find(s => s.id === selectedStudentId);
                  return student ? (
                    <>
                      <div className="font-semibold text-gray-900">{student.fullName}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        <div>📧 {student.email}</div>
                        <div>📞 {student.phone}</div>
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500">No student selected</div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Pickup Address */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-2xl mr-3">📍</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-600 font-medium">Pickup Location for This Lesson</div>
                  {(() => {
                    const student = students.find(s => s.id === selectedStudentId);
                    return student?.address && pickupAddress !== student.address ? (
                      <button
                        onClick={() => setPickupAddress(student.address)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Use Home Address
                      </button>
                    ) : null;
                  })()}
                </div>
                <textarea
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="Enter pickup address for this lesson..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 This is where the instructor will pick up the student. It can be different from their home address.
                </p>
              </div>
            </div>
          </div>

          {/* Instructor Details */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-2xl mr-3">👨‍🏫</span>
              <div className="flex-1">
                <div className="text-sm text-gray-600 font-medium mb-2">Instructor Information</div>
                {(() => {
                  const instructor = instructors.find(i => i.id === selectedInstructorId);
                  return instructor ? (
                    <>
                      <div className="font-semibold text-gray-900">{instructor.fullName}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        <div>📧 {instructor.email}</div>
                        <div>📞 {instructor.phone}</div>
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500">No instructor selected</div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Lesson Cost */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-2xl mr-3">💰</span>
                <div className="text-sm text-gray-600 font-medium">Lesson Cost</div>
              </div>
              <div className="text-2xl font-bold text-green-700">${cost.toFixed(2)}</div>
            </div>
            <div className="text-xs text-gray-600 mt-2 ml-11">
              Payment can be recorded after the lesson
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              onClick={() => setStep('slots')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Go Back
            </button>
            <button
              onClick={() => setStep('confirm')}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Continue to Confirm
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === 'confirm' && selectedSlot && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Confirm Booking</h3>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Time Slot:</span>
              <span className="font-semibold">{formatSlotTime(selectedSlot)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Duration:</span>
              <span className="font-semibold">{duration} minutes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lesson Type:</span>
              <span className="font-semibold capitalize">{lessonType.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-gray-600">Lesson Cost:</span>
              <span className="font-semibold">${cost.toFixed(2)}</span>
            </div>
            {payNow && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Amount:</span>
                  <span className="font-semibold text-green-600">${paymentAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Method:</span>
                  <span className="font-semibold capitalize">{paymentMethod.replace(/_/g, ' ')}</span>
                </div>
                {paymentAmount < cost && (
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600">Remaining Balance:</span>
                    <span className="font-semibold text-amber-600">${(cost - paymentAmount).toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            {!payNow && (
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-600">Payment Status:</span>
                <span className="font-semibold text-amber-600">Pay Later</span>
              </div>
            )}
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 flex items-center">
              <span className="text-2xl mr-2">✅</span>
              No conflicts detected! This slot is available.
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => setStep('details')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Go Back
            </button>
            <button
              onClick={handleConfirmBooking}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 font-medium"
            >
              {loading ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

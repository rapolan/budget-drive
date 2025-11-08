import React, { useState, useEffect } from 'react';
import { schedulingApi, lessonsApi } from '@/api';
import { TimeSlot, SchedulingConflict, Student, Instructor, Vehicle } from '@/types';

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
  const [step, setStep] = useState<'select' | 'slots' | 'confirm'>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [selectedInstructorId, setSelectedInstructorId] = useState(
    preselectedInstructor?.id || ''
  );
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudent?.id || '');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [duration, setDuration] = useState(60);
  const [lessonType, setLessonType] = useState<'behind_wheel' | 'classroom' | 'observation' | 'road_test'>('behind_wheel');
  const [cost, setCost] = useState(50);

  // Slot finding
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 weeks
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
        vehicleId: selectedVehicleId || undefined,
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
    if (!selectedStudentId || !selectedVehicleId) {
      setError('Please select both a student and vehicle before choosing a time slot');
      return;
    }

    setSelectedSlot(slot);

    // Check for conflicts
    try {
      setLoading(true);
      setError(null);
      const conflictList = await schedulingApi.checkConflicts({
        instructorId: selectedInstructorId,
        vehicleId: selectedVehicleId,
        studentId: selectedStudentId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });

      setConflicts(conflictList);
      setShowConflicts(conflictList.length > 0);

      if (conflictList.length === 0) {
        setStep('confirm');
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
        vehicleId: selectedVehicleId,
        date: selectedSlot.date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        duration,
        lessonType,
        cost,
      };

      const lesson = await lessonsApi.create(lessonData);
      onBookingComplete?.(lesson.id);
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
    return `${dayName}, ${formattedDate} at ${slot.startTime}`;
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
            className="text-gray-500 hover:text-gray-700"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructor *
              </label>
              <input
                type="text"
                value={selectedInstructorId}
                onChange={(e) => setSelectedInstructorId(e.target.value)}
                placeholder="Instructor ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!!preselectedInstructor}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Student *
              </label>
              <input
                type="text"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                placeholder="Student ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!!preselectedStudent}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle *
              </label>
              <input
                type="text"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                placeholder="Vehicle ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
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
            <button
              onClick={() => setStep('select')}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Change Criteria
            </button>
          </div>

          {availableSlots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available slots found in the selected date range. Try adjusting your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {availableSlots.map((slot, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSlot(slot)}
                  className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
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

      {/* Step 3: Confirmation */}
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
              <span className="font-semibold">{lessonType.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Cost:</span>
              <span className="font-semibold">${cost.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 flex items-center">
              <span className="text-2xl mr-2">✅</span>
              No conflicts detected! This slot is available.
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => setStep('slots')}
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

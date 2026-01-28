import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, CheckCircle, Clock, Hash, Calendar, User, FileText } from 'lucide-react';
import { lessonsApi, studentsApi, instructorsApi, vehiclesApi } from '@/api';
import type { Lesson, CreateLessonInput } from '@/types';

interface LessonModalProps {
  lesson: Lesson | null;
  onClose: () => void;
}

export const LessonModal: React.FC<LessonModalProps> = ({ lesson, onClose }) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(lesson);

  const [formData, setFormData] = useState<CreateLessonInput>({
    studentId: '',
    instructorId: '',
    vehicleId: '', // Will be auto-assigned to first available vehicle
    date: '',
    startTime: '',
    endTime: '',
    duration: 60,
    lessonNumber: null,
    lessonType: 'behind_wheel',
    cost: 50,
    notes: '',
  });

  // Fetch related data for dropdowns
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getAll(),
  });

  // Auto-select first available vehicle
  useEffect(() => {
    if (vehiclesData?.data && vehiclesData.data.length > 0 && !formData.vehicleId) {
      const activeVehicle = vehiclesData.data.find(v => v.status === 'active');
      if (activeVehicle) {
        setFormData(prev => ({ ...prev, vehicleId: activeVehicle.id }));
      }
    }
  }, [vehiclesData, formData.vehicleId]);

  // Fetch all lessons to calculate student's lesson count
  const { data: allLessonsData } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 10000),
  });

  // Calculate how many lessons the selected student has (excluding current if editing)
  const selectedStudent = studentsData?.data?.find(s => s.id === formData.studentId);
  const studentLessons = allLessonsData?.data?.filter(l =>
    l.studentId === formData.studentId &&
    l.status !== 'cancelled' &&
    (!isEditing || l.id !== lesson?.id)
  ) || [];
  const suggestedLessonNumber = studentLessons.length + 1;
  const totalHoursRequired = selectedStudent?.hoursRequired || 6;
  // Estimate total lessons based on 2-hour lessons (can be adjusted)
  const estimatedTotalLessons = Math.ceil(totalHoursRequired / 2);

  // Fetch instructor's lessons for the selected date to check availability
  const { data: instructorLessonsData } = useQuery({
    queryKey: ['instructor-lessons', formData.instructorId, formData.date],
    queryFn: () => lessonsApi.getByInstructor(formData.instructorId),
    enabled: !!formData.instructorId && !!formData.date,
  });

  const instructorLessons = instructorLessonsData?.data || [];

  // Filter lessons for the selected date only
  const sameDayLessons = instructorLessons.filter((l) => {
    if (!formData.date) return false;
    const lessonDate = new Date(l.date).toISOString().split('T')[0];
    return lessonDate === formData.date && l.status === 'scheduled';
  });

  // Check if there's a time conflict
  const hasTimeConflict = () => {
    if (!formData.startTime || !formData.endTime || sameDayLessons.length === 0) {
      return false;
    }

    const newStart = formData.startTime;
    const newEnd = formData.endTime;

    return sameDayLessons.some((existingLesson) => {
      // Skip if we're editing the same lesson
      if (lesson && existingLesson.id === lesson.id) return false;

      const existingStart = existingLesson.startTime.substring(0, 5);
      const existingEnd = existingLesson.endTime.substring(0, 5);

      // Check for overlap: new lesson starts before existing ends AND new lesson ends after existing starts
      return newStart < existingEnd && newEnd > existingStart;
    });
  };

  // Find next available slot
  const findNextAvailableSlot = () => {
    if (sameDayLessons.length === 0 || !formData.duration) {
      return null;
    }

    // Sort lessons by start time
    const sortedLessons = [...sameDayLessons].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );

    // Check after the last lesson
    const lastLesson = sortedLessons[sortedLessons.length - 1];
    const lastEnd = lastLesson.endTime.substring(0, 5);

    // Calculate suggested start time (30 min after last lesson ends)
    const [hours, minutes] = lastEnd.split(':').map(Number);
    const suggestedStartMinutes = hours * 60 + minutes + 30;
    const suggestedHours = Math.floor(suggestedStartMinutes / 60);
    const suggestedMins = suggestedStartMinutes % 60;

    if (suggestedHours < 18) { // Before 6 PM
      return `${String(suggestedHours).padStart(2, '0')}:${String(suggestedMins).padStart(2, '0')}`;
    }

    return null;
  };

  const conflict = hasTimeConflict();
  const nextAvailable = conflict ? findNextAvailableSlot() : null;

  useEffect(() => {
    if (lesson) {
      setFormData({
        studentId: lesson.studentId,
        instructorId: lesson.instructorId,
        vehicleId: lesson.vehicleId,
        date: new Date(lesson.date).toISOString().split('T')[0],
        startTime: lesson.startTime.substring(0, 5), // Convert HH:MM:SS to HH:MM
        endTime: lesson.endTime.substring(0, 5),
        duration: lesson.duration,
        lessonNumber: lesson.lessonNumber || null,
        lessonType: lesson.lessonType,
        cost: lesson.cost,
        notes: lesson.notes || '',
      });
    }
  }, [lesson]);

  // Auto-calculate duration when times change
  useEffect(() => {
    if (formData.startTime && formData.endTime) {
      const [startHours, startMinutes] = formData.startTime.split(':').map(Number);
      const [endHours, endMinutes] = formData.endTime.split(':').map(Number);

      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      if (endTotalMinutes > startTotalMinutes) {
        const calculatedDuration = endTotalMinutes - startTotalMinutes;
        setFormData((prev) => ({ ...prev, duration: calculatedDuration }));
      }
    }
  }, [formData.startTime, formData.endTime]);

  // Auto-suggest lesson number when student changes (only for new lessons)
  useEffect(() => {
    if (!isEditing && formData.studentId && suggestedLessonNumber > 0) {
      setFormData(prev => ({ ...prev, lessonNumber: suggestedLessonNumber }));
    }
  }, [formData.studentId, suggestedLessonNumber, isEditing]);

  const createMutation = useMutation({
    mutationFn: (data: CreateLessonInput) => lessonsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      queryClient.invalidateQueries({ queryKey: ['treasury'] }); // Refresh treasury data
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateLessonInput) => lessonsApi.update(lesson!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      onClose();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.studentId || !formData.instructorId || !formData.vehicleId) {
      alert('Please select student and instructor');
      return;
    }

    if (!formData.date || !formData.startTime || !formData.endTime) {
      alert('Please fill in date and times');
      return;
    }

    if (formData.duration <= 0) {
      alert('End time must be after start time');
      return;
    }

    // Conflict is already shown inline and blocks submission via disabled button
    // No need to proceed if there's a conflict
    if (conflict) {
      return;
    }

    // Transform frontend fields to backend format
    const scheduledStart = `${formData.date}T${formData.startTime}:00`;
    const scheduledEnd = `${formData.date}T${formData.endTime}:00`;

    const lessonData = {
      studentId: formData.studentId,
      instructorId: formData.instructorId,
      vehicleId: formData.vehicleId,
      scheduledStart,
      scheduledEnd,
      lessonNumber: formData.lessonNumber,
      lessonType: formData.lessonType,
      cost: formData.cost,
      notes: formData.notes,
    };

    if (isEditing) {
      await updateMutation.mutateAsync(lessonData as any);
    } else {
      await createMutation.mutateAsync(lessonData as any);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'cost' || name === 'duration' ? Number(value) : value
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Edit Lesson' : 'Add New Lesson'}
                </h2>
                <p className="text-sm text-gray-500">
                  {isEditing ? 'Update lesson details' : 'Schedule a new driving lesson'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Student & Lesson Number Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Student */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <User className="h-4 w-4 text-blue-600" />
                Student
                <span className="text-red-500">*</span>
              </label>
              <select
                name="studentId"
                value={formData.studentId}
                onChange={handleChange}
                required
                title="Select Student"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Student</option>
                {studentsData?.data
                  ?.filter((s) => s.status === 'active')
                  .map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName}
                    </option>
                  ))}
              </select>
            </div>

            {/* Lesson Number */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <Hash className="h-4 w-4 text-blue-600" />
                Lesson #
              </label>
              <div className="flex items-center gap-2">
                <select
                  name="lessonNumber"
                  value={formData.lessonNumber || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    lessonNumber: e.target.value ? parseInt(e.target.value) : null
                  }))}
                  title="Lesson Number"
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="">--</option>
                  {Array.from({ length: Math.max(estimatedTotalLessons, 10) }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>
                      Lesson #{num}
                    </option>
                  ))}
                </select>
                {formData.studentId && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    of ~{estimatedTotalLessons}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Instructor & Type Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Instructor */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <User className="h-4 w-4 text-blue-600" />
                Instructor
                <span className="text-red-500">*</span>
              </label>
              <select
                name="instructorId"
                value={formData.instructorId}
                onChange={handleChange}
                required
                title="Select Instructor"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Instructor</option>
                {instructorsData?.data
                  ?.filter((i) => i.status === 'active')
                  .map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.fullName}
                    </option>
                  ))}
              </select>
            </div>

            {/* Lesson Type */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Lesson Type
                <span className="text-red-500">*</span>
              </label>
              <select
                name="lessonType"
                value={formData.lessonType}
                onChange={handleChange}
                required
                title="Select Lesson Type"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="behind_wheel">Behind the Wheel</option>
                <option value="classroom">Classroom</option>
                <option value="road_test_prep">Road Test Prep</option>
              </select>
            </div>
          </div>

          {/* Date Row */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Date
              <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
              autoComplete="off"
              title="Select Date"
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Start Time */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Start Time
                <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
                required
                autoComplete="off"
                title="Select Start Time"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <Clock className="h-4 w-4 text-blue-600" />
                End Time
                <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                name="endTime"
                value={formData.endTime}
                onChange={handleChange}
                required
                autoComplete="off"
                title="Select End Time"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Duration (auto-calculated) */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <Clock className="h-4 w-4 text-gray-400" />
                Duration
              </label>
              <input
                type="text"
                value={`${formData.duration} min`}
                readOnly
                className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed"
                title="Auto-calculated from start and end times"
              />
            </div>
          </div>

          {/* Cost Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                <span className="text-blue-600">$</span>
                Cost
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="50.00"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Additional notes about this lesson..."
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Availability Indicator */}
          {formData.instructorId && formData.date && (
            <div className="space-y-3">
              {sameDayLessons.length === 0 ? (
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                  <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Instructor is available all day
                    </p>
                    <p className="text-xs text-green-700 mt-0.5">
                      No other lessons scheduled for this date
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <Clock className="h-5 w-5 flex-shrink-0 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900">
                        Instructor's schedule for this day:
                      </p>
                      <div className="mt-2 space-y-1">
                        {sameDayLessons.map((l, idx) => (
                          <p key={idx} className="text-xs text-blue-700">
                            • {l.startTime.substring(0, 5)} - {l.endTime.substring(0, 5)} (Busy)
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  {conflict && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-900">
                          Time conflict detected
                        </p>
                        <p className="text-xs text-red-700 mt-0.5">
                          The instructor is already booked during this time.
                          {nextAvailable && (
                            <span className="ml-1 font-medium">
                              Next available: {nextAvailable}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {!conflict && formData.startTime && formData.endTime && (
                    <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                      <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-900">
                          Selected time is available
                        </p>
                        <p className="text-xs text-green-700 mt-0.5">
                          No conflicts with existing lessons
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* BDP Info Banner */}
          {!isEditing && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> Creating this lesson will automatically record a 5 satoshi treasury fee
                and queue email notifications (booking confirmation, 24hr reminder, 1hr reminder) for both
                student and instructor.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={conflict || createMutation.isPending || updateMutation.isPending}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : 'Create Lesson'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
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
    vehicleId: '',
    date: '',
    startTime: '',
    endTime: '',
    duration: 60,
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
      alert('Please select student, instructor, and vehicle');
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

    if (isEditing) {
      await updateMutation.mutateAsync(formData);
    } else {
      await createMutation.mutateAsync(formData);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditing ? 'Edit Lesson' : 'Add New Lesson'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Student */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Student *
              </label>
              <select
                name="studentId"
                value={formData.studentId}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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

            {/* Instructor */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Instructor *
              </label>
              <select
                name="instructorId"
                value={formData.instructorId}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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

            {/* Vehicle */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Vehicle *
              </label>
              <select
                name="vehicleId"
                value={formData.vehicleId}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select Vehicle</option>
                {vehiclesData?.data
                  ?.filter((v) => v.status === 'active')
                  .map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.licensePlate}
                    </option>
                  ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Date *
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Lesson Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Lesson Type *
              </label>
              <select
                name="lessonType"
                value={formData.lessonType}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="behind_wheel">Behind the Wheel</option>
                <option value="classroom">Classroom</option>
                <option value="observation">Observation</option>
                <option value="road_test">Road Test</option>
              </select>
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Start Time *
              </label>
              <input
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                End Time *
              </label>
              <input
                type="time"
                name="endTime"
                value={formData.endTime}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Duration (auto-calculated) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Duration (minutes)
              </label>
              <input
                type="number"
                name="duration"
                value={formData.duration}
                onChange={handleChange}
                min="0"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 bg-gray-50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                readOnly
              />
              <p className="mt-1 text-xs text-gray-500">
                Auto-calculated from start and end times
              </p>
            </div>

            {/* Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Cost ($) *
              </label>
              <input
                type="number"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Additional notes about this lesson..."
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* BDP Info Banner */}
          {!isEditing && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> Creating this lesson will automatically record a 5 satoshi treasury fee
                and queue email notifications (booking confirmation, 24hr reminder, 1hr reminder) for both
                student and instructor.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEditing
                ? 'Update Lesson'
                : 'Create Lesson'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

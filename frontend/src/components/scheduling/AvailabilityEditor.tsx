import React, { useState, useEffect } from 'react';
import { schedulingApi } from '@/api';
import { InstructorAvailability, CreateAvailabilityInput } from '@/types';
import { Info } from 'lucide-react';

interface AvailabilityEditorProps {
  instructorId: string;
  onUpdate?: () => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export const AvailabilityEditor: React.FC<AvailabilityEditorProps> = ({
  instructorId,
  onUpdate,
}) => {
  const [availability, setAvailability] = useState<InstructorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [schedulingSettings, setSchedulingSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const [formData, setFormData] = useState<CreateAvailabilityInput>({
    instructorId,
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '16:00', // Will be calculated automatically but backend still requires it
    maxStudents: null, // null = use tenant default
    isActive: true,
  });

  useEffect(() => {
    loadAvailability();
    loadSchedulingSettings();
  }, [instructorId]);

  const loadSchedulingSettings = async () => {
    try {
      setLoadingSettings(true);
      const response = await fetch('http://localhost:3000/api/v1/availability/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
        },
      });
      if (response.ok) {
        const result = await response.json();
        setSchedulingSettings(result.data);
      }
    } catch (err) {
      console.error('Error loading scheduling settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadAvailability = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await schedulingApi.getInstructorAvailability(instructorId);
      setAvailability(data.sort((a, b) => a.dayOfWeek - b.dayOfWeek));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load availability');
      console.error('Error loading availability:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate end time based on capacity-based scheduling
  const calculateEndTime = (startTime: string, maxStudentsOverride?: number | null): string => {
    if (!schedulingSettings) return '16:00';

    const defaultLessonDuration = schedulingSettings.defaultLessonDuration || 120;
    const bufferTime = schedulingSettings.bufferTimeBetweenLessons || 30;
    // Use override if provided, otherwise use tenant default
    const maxStudents = maxStudentsOverride ?? schedulingSettings.defaultMaxStudentsPerDay ?? 3;

    // Parse start time
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;

    // Calculate total time needed: (lesson_duration × max_students) + (buffer × (max_students - 1))
    const totalMinutes = (defaultLessonDuration * maxStudents) + (bufferTime * (maxStudents - 1));
    const endMinutes = startMinutes + totalMinutes;

    // Convert back to HH:MM format
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;

    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError(null);

      // Calculate end time automatically based on maxStudents override
      const calculatedEndTime = calculateEndTime(formData.startTime, formData.maxStudents);

      await schedulingApi.createAvailability({
        ...formData,
        endTime: calculatedEndTime,
      });

      await loadAvailability();
      setShowAddForm(false);
      setFormData({
        instructorId,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '16:00',
        maxStudents: null,
        isActive: true,
      });
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create availability');
      console.error('Error creating availability:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this availability slot?')) return;

    try {
      setError(null);
      await schedulingApi.deleteAvailability(id);
      await loadAvailability();
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete availability');
      console.error('Error deleting availability:', err);
    }
  };

  const handleToggleActive = async (slot: InstructorAvailability) => {
    try {
      setError(null);
      await schedulingApi.updateAvailability(slot.id, {
        isActive: !slot.isActive,
      });
      await loadAvailability();
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update availability');
      console.error('Error updating availability:', err);
    }
  };

  const getDayLabel = (dayOfWeek: number): string => {
    return DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label || 'Unknown';
  };

  if (loading || loadingSettings) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading availability...</div>
      </div>
    );
  }

  const effectiveMaxStudents = formData.maxStudents ?? schedulingSettings?.defaultMaxStudentsPerDay ?? 3;
  const calculatedEndTime = calculateEndTime(formData.startTime, formData.maxStudents);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Capacity-Based Scheduling</p>
          <p>
            Set only the <strong>start time</strong> for each day. End time is automatically calculated based on school settings:{' '}
            <strong>{schedulingSettings?.defaultMaxStudentsPerDay || 3} students/day</strong>,{' '}
            <strong>{schedulingSettings?.defaultLessonDuration || 120} min lessons</strong>,{' '}
            <strong>{schedulingSettings?.bufferTimeBetweenLessons || 30} min buffer</strong>.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Weekly Availability</h3>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Availability'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day of Week
              </label>
              <select
                value={formData.dayOfWeek}
                onChange={(e) =>
                  setFormData({ ...formData, dayOfWeek: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                title="Select day of week"
                required
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Students
              </label>
              <select
                value={formData.maxStudents ?? ''}
                onChange={(e) =>
                  setFormData({ 
                    ...formData, 
                    maxStudents: e.target.value === '' ? null : parseInt(e.target.value) 
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                title="Select max students for this slot"
              >
                <option value="">Default ({schedulingSettings?.defaultMaxStudentsPerDay || 3})</option>
                <option value="1">1 student (single lesson)</option>
                <option value="2">2 students</option>
                <option value="3">3 students</option>
                <option value="4">4 students</option>
                <option value="5">5 students</option>
              </select>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Day ends around <strong>{calculatedEndTime}</strong> ({effectiveMaxStudents} student{effectiveMaxStudents !== 1 ? 's' : ''} × {schedulingSettings?.defaultLessonDuration || 120} min + buffers)
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
          >
            {saving ? 'Adding...' : 'Add Availability'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {availability.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No availability slots configured. Click "Add Availability" to get started.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Day
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max Students
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Calculated End
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {availability.map((slot) => {
                const slotMaxStudents = slot.maxStudents ?? schedulingSettings?.defaultMaxStudentsPerDay ?? 3;
                return (
                <tr key={slot.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getDayLabel(slot.dayOfWeek)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                    {slot.startTime}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {slot.maxStudents === null ? (
                      <span className="text-gray-500">{slotMaxStudents} <span className="text-xs">(default)</span></span>
                    ) : (
                      <span className={slot.maxStudents === 1 ? 'text-orange-600 font-medium' : ''}>
                        {slot.maxStudents} {slot.maxStudents === 1 && <span className="text-xs">(single)</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ~{slot.endTime}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        slot.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {slot.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleToggleActive(slot)}
                        className="px-3 py-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                      >
                        {slot.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(slot.id)}
                        className="px-3 py-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

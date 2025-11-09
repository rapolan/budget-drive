import React, { useState, useEffect } from 'react';
import {
  patternsApi,
  RecurringPattern,
  CreatePatternInput,
  GenerateLessonsResult,
} from '@/api/patterns';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const RECURRENCE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

export const RecurringPatterns: React.FC = () => {
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<CreatePatternInput>>({
    lessonType: 'behind_wheel',
    recurrenceType: 'weekly',
    daysOfWeek: [],
    duration: 120,
    cost: 50,
    deductFromPackage: false,
  });

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await patternsApi.getPatterns();
      setPatterns(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load patterns');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.patternName || !formData.studentId || !formData.instructorId || !formData.vehicleId) {
      alert('Please fill in all required fields');
      return;
    }

    if (!formData.daysOfWeek || formData.daysOfWeek.length === 0) {
      alert('Please select at least one day of the week');
      return;
    }

    if (!formData.timeOfDay || !formData.startDate) {
      alert('Please specify time and start date');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await patternsApi.createPattern(formData as CreatePatternInput);
      setShowForm(false);
      setFormData({
        lessonType: 'behind_wheel',
        recurrenceType: 'weekly',
        daysOfWeek: [],
        duration: 120,
        cost: 50,
        deductFromPackage: false,
      });
      await loadPatterns();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create pattern');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLessons = async (patternId: string) => {
    if (!confirm('Generate lessons from this pattern? This will create actual lesson records.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result: GenerateLessonsResult = await patternsApi.generateLessons(patternId);
      alert(
        `Success! Generated ${result.lessons_generated} lessons from pattern.\n\n` +
        `Pattern ID: ${result.pattern_id}`
      );
      await loadPatterns();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate lessons');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePattern = async (patternId: string) => {
    if (!confirm('Delete this pattern? Past lessons will remain, but no new lessons will be generated.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await patternsApi.deletePattern(patternId);
      await loadPatterns();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete pattern');
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    const current = formData.daysOfWeek || [];
    if (current.includes(day)) {
      setFormData({ ...formData, daysOfWeek: current.filter((d) => d !== day) });
    } else {
      setFormData({ ...formData, daysOfWeek: [...current, day].sort() });
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center">
            <span className="text-xl mr-3">⚠️</span>
            <div>
              <strong className="font-medium">Error:</strong>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Recurring Lesson Patterns</h2>
          <p className="text-sm text-gray-600 mt-1">
            Schedule multiple lessons at once with recurring patterns
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Pattern'}
        </button>
      </div>

      {/* Create Pattern Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Recurring Pattern</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pattern Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pattern Name *
              </label>
              <input
                type="text"
                value={formData.patternName || ''}
                onChange={(e) => setFormData({ ...formData, patternName: e.target.value })}
                placeholder="e.g., Mike's Weekly Lessons"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Student ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Student ID *
              </label>
              <input
                type="text"
                value={formData.studentId || ''}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                placeholder="Student UUID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Instructor ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructor ID *
              </label>
              <input
                type="text"
                value={formData.instructorId || ''}
                onChange={(e) => setFormData({ ...formData, instructorId: e.target.value })}
                placeholder="Instructor UUID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Vehicle ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle ID *
              </label>
              <input
                type="text"
                value={formData.vehicleId || ''}
                onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                placeholder="Vehicle UUID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Recurrence Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recurrence Type *
              </label>
              <select
                value={formData.recurrenceType}
                onChange={(e) =>
                  setFormData({ ...formData, recurrenceType: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {RECURRENCE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (minutes) *
              </label>
              <input
                type="number"
                value={formData.duration || 120}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                min="30"
                step="30"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost per Lesson ($) *
              </label>
              <input
                type="number"
                value={formData.cost || 50}
                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) })}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Time of Day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time of Day *
              </label>
              <input
                type="time"
                value={formData.timeOfDay || ''}
                onChange={(e) => setFormData({ ...formData, timeOfDay: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.startDate || ''}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date (optional)
              </label>
              <input
                type="date"
                value={formData.endDate || ''}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Max Occurrences */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Occurrences (optional)
              </label>
              <input
                type="number"
                value={formData.maxOccurrences || ''}
                onChange={(e) =>
                  setFormData({ ...formData, maxOccurrences: parseInt(e.target.value) })
                }
                min="1"
                placeholder="Unlimited if empty"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Days of Week */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Days of Week *
            </label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    formData.daysOfWeek?.includes(day.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Additional notes about this pattern..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Payment Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Payment:</strong> Students pay after each lesson by default. No upfront payment required.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Pattern'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Patterns List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Active Patterns</h3>
        </div>

        {loading && patterns.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : patterns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No recurring patterns created yet. Click "New Pattern" to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {patterns.map((pattern) => (
              <div key={pattern.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-lg font-semibold text-gray-900">
                        {pattern.patternName}
                      </h4>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          pattern.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {pattern.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {pattern.description && (
                      <p className="text-sm text-gray-600 mb-3">{pattern.description}</p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Recurrence:</span>
                        <p className="font-medium text-gray-900 capitalize">
                          {pattern.recurrenceType}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <p className="font-medium text-gray-900">{pattern.duration} min</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Cost:</span>
                        <p className="font-medium text-gray-900">${pattern.cost}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Time:</span>
                        <p className="font-medium text-gray-900">{pattern.timeOfDay}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Start Date:</span>
                        <p className="font-medium text-gray-900">{pattern.startDate}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Days:</span>
                        <p className="font-medium text-gray-900">
                          {pattern.daysOfWeek
                            .map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label)
                            .join(', ')}
                        </p>
                      </div>
                      {pattern.totalOccurrences !== undefined && (
                        <div>
                          <span className="text-gray-500">Progress:</span>
                          <p className="font-medium text-gray-900">
                            {pattern.completedOccurrences || 0} / {pattern.totalOccurrences}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => handleGenerateLessons(pattern.id)}
                      disabled={loading || !pattern.isActive}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate Lessons
                    </button>
                    <button
                      onClick={() => handleDeletePattern(pattern.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

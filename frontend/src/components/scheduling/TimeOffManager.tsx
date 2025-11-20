import React, { useState, useEffect } from 'react';
import { schedulingApi } from '@/api';
import { InstructorTimeOff } from '@/types';

interface TimeOffManagerProps {
  instructorId?: string; // If provided, show only this instructor's time off
  showAllInstructors?: boolean; // If true, show all instructors (admin view)
  allowApproval?: boolean; // If true, show approve/reject buttons
  onUpdate?: () => void;
}

export const TimeOffManager: React.FC<TimeOffManagerProps> = ({
  instructorId,
  showAllInstructors = false,
  allowApproval = false,
  onUpdate,
}) => {
  const [timeOffs, setTimeOffs] = useState<InstructorTimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');

  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    reason: '',
    notes: '',
  });

  // Helper to determine status from isApproved
  const getStatus = (timeOff: InstructorTimeOff): 'pending' | 'approved' => {
    return timeOff.isApproved ? 'approved' : 'pending';
  };

  useEffect(() => {
    loadTimeOffs();
  }, [instructorId, showAllInstructors, filterStatus]);

  const loadTimeOffs = async () => {
    try {
      setLoading(true);
      setError(null);

      let data: InstructorTimeOff[];

      if (showAllInstructors) {
        // getAllTimeOff endpoint may not be implemented - use getInstructorTimeOff for now
        data = [];
      } else if (instructorId) {
        data = await schedulingApi.getInstructorTimeOff(instructorId);
        if (filterStatus !== 'all') {
          data = data.filter((t) => getStatus(t) === filterStatus);
        }
      } else {
        data = [];
      }

      setTimeOffs(data.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load time off requests');
      console.error('Error loading time offs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!instructorId) {
      setError('Instructor ID is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await schedulingApi.createTimeOff({
        instructorId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        startTime: formData.startTime || undefined,
        endTime: formData.endTime || undefined,
        reason: formData.reason,
        notes: formData.notes || undefined,
      });

      await loadTimeOffs();
      setShowAddForm(false);
      setFormData({
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
        reason: '',
        notes: '',
      });
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create time off request');
      console.error('Error creating time off:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this time off request?')) return;

    try {
      setError(null);
      await schedulingApi.deleteTimeOff(id);
      await loadTimeOffs();
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete time off');
      console.error('Error deleting time off:', err);
    }
  };

  const handleUpdateStatus = async (id: string, isApproved: boolean) => {
    try {
      setError(null);
      await schedulingApi.updateTimeOff(id, { isApproved });
      await loadTimeOffs();
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update time off status');
      console.error('Error updating time off:', err);
    }
  };

  const formatDate = (date: Date | string): string => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time: string | null): string => {
    if (!time) return '';
    // Remove seconds if present
    return time.substring(0, 5);
  };

  const getStatusColor = (timeOff: InstructorTimeOff): string => {
    return timeOff.isApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
  };

  const getStatusLabel = (timeOff: InstructorTimeOff): string => {
    return timeOff.isApproved ? 'Approved' : 'Pending';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading time off requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-gray-900">Time Off Requests</h3>

          {showAllInstructors && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          )}
        </div>

        {instructorId && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Request Time Off'}
          </button>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date *
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time (Optional for partial day)
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time (Optional for partial day)
              </label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason *
            </label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Vacation, Sick leave, Personal"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional details..."
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
          >
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {timeOffs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {filterStatus === 'all'
              ? 'No time off requests found.'
              : `No ${filterStatus} requests found.`}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  End Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
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
              {timeOffs.map((timeOff) => (
                <tr key={timeOff.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(timeOff.startDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(timeOff.endDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {timeOff.startTime && timeOff.endTime
                      ? `${formatTime(timeOff.startTime)} - ${formatTime(timeOff.endTime)}`
                      : 'Full day'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {timeOff.reason || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                        timeOff
                      )}`}
                    >
                      {getStatusLabel(timeOff)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {allowApproval && !timeOff.isApproved && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(timeOff.id, true)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Approve
                        </button>
                      </>
                    )}
                    {!timeOff.isApproved && (
                      <button
                        onClick={() => handleDelete(timeOff.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

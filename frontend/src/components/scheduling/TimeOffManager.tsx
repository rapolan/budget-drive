import React, { useState, useEffect } from 'react';
import { schedulingApi } from '@/api';
import { InstructorTimeOff, CreateTimeOffInput } from '@/types';

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
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const [formData, setFormData] = useState<CreateTimeOffInput>({
    instructorId: instructorId || '',
    startDate: '',
    endDate: '',
    reason: '',
    status: 'pending',
  });

  useEffect(() => {
    loadTimeOffs();
  }, [instructorId, showAllInstructors, filterStatus]);

  const loadTimeOffs = async () => {
    try {
      setLoading(true);
      setError(null);

      let data: InstructorTimeOff[];

      if (showAllInstructors) {
        const status = filterStatus === 'all' ? undefined : filterStatus;
        data = await schedulingApi.getAllTimeOff(status as any);
      } else if (instructorId) {
        data = await schedulingApi.getInstructorTimeOff(instructorId);
        if (filterStatus !== 'all') {
          data = data.filter((t) => t.status === filterStatus);
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

    if (!formData.instructorId) {
      setError('Instructor ID is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await schedulingApi.createTimeOff(formData);
      await loadTimeOffs();
      setShowAddForm(false);
      setFormData({
        instructorId: instructorId || '',
        startDate: '',
        endDate: '',
        reason: '',
        status: 'pending',
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

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      setError(null);
      await schedulingApi.updateTimeOff(id, { status });
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

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
              <option value="rejected">Rejected</option>
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
                Start Date
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
                End Date
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason (Optional)
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Vacation, Sick leave, Personal emergency"
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
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {timeOff.reason || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                        timeOff.status
                      )}`}
                    >
                      {timeOff.status.charAt(0).toUpperCase() + timeOff.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {allowApproval && timeOff.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(timeOff.id, 'approved')}
                          className="text-green-600 hover:text-green-900"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(timeOff.id, 'rejected')}
                          className="text-red-600 hover:text-red-900"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {timeOff.status === 'pending' && (
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

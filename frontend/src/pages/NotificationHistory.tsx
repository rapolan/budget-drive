/**
 * Notification History Page
 * View sent/failed notifications with stats and BDP fee tracking
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, RefreshCw, AlertCircle, CheckCircle, XCircle, Mail, Clock } from 'lucide-react';
import { getNotificationHistory, processNotificationQueue } from '../api/notifications';
import { BackButton } from '@/components/common';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

export default function NotificationHistory() {
  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'failed'>('all');

  // Fetch notification history
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notificationHistory'],
    queryFn: () => getNotificationHistory(),
  });

  // Manual process notifications
  const handleProcessQueue = async () => {
    setIsProcessing(true);
    try {
      await processNotificationQueue();
      await refetch();
      alert('Notification queue processed successfully!');
    } catch (error) {
      console.error('Failed to process queue:', error);
      alert('Failed to process notification queue');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredData = data?.data?.filter((item) => {
    if (filterStatus === 'all') return true;
    return item.status === filterStatus;
  }) || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-tx-muted" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[status as keyof typeof colors] || 'bg-surface2 text-tx-primary'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const getNotificationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      reminder_24h: '24-Hour Reminder',
      reminder_1h: '1-Hour Reminder',
      booking_confirmation: 'Booking Confirmation',
      cancellation: 'Cancellation Notice',
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-surface2 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <BackButton />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
            <div className="flex items-center space-x-3">
              <Bell className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
              <h1 className="text-xl sm:text-3xl font-bold text-tx-primary">Notification History</h1>
            </div>
            <button
              onClick={handleProcessQueue}
              disabled={isProcessing}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:brightness-90 hover:bg-primary hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
            >
              <RefreshCw className={`w-4 h-4 flex-shrink-0 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Processing...' : 'Process Queue'}</span>
            </button>
          </div>
          <p className="mt-2 text-sm sm:text-base text-tx-secondary">
            View sent and failed email notifications. BDP fee: 1 satoshi per notification.
          </p>
        </div>

        {/* Stats Cards */}
        {data?.stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <div className="bg-surface rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-tx-secondary">Total Sent</p>
                  <p className="text-2xl font-bold text-green-600">{data.stats.totalSent.toLocaleString()}</p>
                </div>
                <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
              </div>
            </div>

            <div className="bg-surface rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-tx-secondary">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{data.stats.totalFailed.toLocaleString()}</p>
                </div>
                <XCircle className="w-12 h-12 text-red-500 opacity-20" />
              </div>
            </div>

            <div className="bg-surface rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-tx-secondary">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{data.stats.totalPending.toLocaleString()}</p>
                </div>
                <Clock className="w-12 h-12 text-yellow-500 opacity-20" />
              </div>
            </div>

            <div className="bg-surface rounded-lg shadow p-6 border-2 border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-tx-secondary">BDP Fees</p>
                  <p className="text-2xl font-bold text-primary">{data.stats.totalFeesSats} sats</p>
                  <p className="text-xs text-tx-muted mt-1">
                    ${data.stats.totalFeesUsd.toFixed(10)} USD
                  </p>
                </div>
                <Bell className="w-12 h-12 text-primary opacity-20" />
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="bg-surface rounded-lg shadow mb-6">
          <div className="border-b border-[var(--border)]">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {['all', 'sent', 'failed'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterStatus(tab as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    filterStatus === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-tx-muted hover:text-tx-secondary hover:border-[var(--border-strong)]'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Notifications Table */}
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <span className="ml-3 text-tx-secondary">Loading notifications...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-600">
              <AlertCircle className="w-8 h-8 mr-3" />
              <span>Failed to load notifications</span>
            </div>
          ) : !filteredData || filteredData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-tx-muted">
              <Mail className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No notifications found</p>
              <p className="text-sm mt-2">Notifications will appear here once lessons are booked</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="bg-surface2">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">
                      Lesson Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">
                      Sent At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">
                      Attempts
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-[var(--border)]">
                  {filteredData.map((notification) => (
                    <tr key={notification.id} className="hover:bg-surface2">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(notification.status)}
                          {getStatusBadge(notification.status)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-tx-primary">
                          {getNotificationTypeLabel(notification.notificationType)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <div className="font-medium text-tx-primary">
                            {notification.recipientType === 'student'
                              ? notification.studentName
                              : notification.instructorName}
                          </div>
                          <div className="text-tx-muted">{notification.recipientEmail}</div>
                          <div className="text-xs text-tx-muted capitalize">{notification.recipientType}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <div className="font-medium text-tx-primary">{notification.lessonDate}</div>
                          <div className="text-tx-muted">{notification.lessonTime}</div>
                          <div className="text-xs text-tx-muted">
                            {notification.studentName} with {notification.instructorName}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-tx-primary">
                          {notification.sentAt
                            ? new Date(notification.sentAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-tx-primary">{notification.attemptCount}</div>
                        {notification.errorMessage && (
                          <div className="text-xs text-red-500 mt-1" title={notification.errorMessage}>
                            Error
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Bell className="w-5 h-5 text-primary mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Budget Drive Protocol (BDP) Notification System</p>
              <p>
                Automated email notifications powered by BSV blockchain micropayments. Each sent notification costs 1
                satoshi (~$0.0000005 USD). Notifications are processed automatically every 5 minutes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

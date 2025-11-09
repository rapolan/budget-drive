import React, { useState, useEffect } from 'react';
import { calendarApi, CalendarSyncStatus, ExternalCalendarEvent } from '@/api/calendar';

interface CalendarSyncProps {
  instructorId: string;
}

export const CalendarSync: React.FC<CalendarSyncProps> = ({ instructorId }) => {
  const [status, setStatus] = useState<CalendarSyncStatus | null>(null);
  const [externalEvents, setExternalEvents] = useState<ExternalCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (instructorId) {
      loadStatus();
    }
  }, [instructorId]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const statusData = await calendarApi.getSyncStatus(instructorId);
      setStatus(statusData);

      if (statusData.isConnected) {
        const events = await calendarApi.getExternalEvents(instructorId);
        setExternalEvents(events);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load calendar status');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);
      const { authUrl } = await calendarApi.getAuthUrl(instructorId);

      // Open OAuth URL in new window
      window.open(authUrl, 'google-calendar-oauth', 'width=600,height=700');

      // Poll for status change
      const pollInterval = setInterval(async () => {
        const newStatus = await calendarApi.getSyncStatus(instructorId);
        if (newStatus.isConnected) {
          clearInterval(pollInterval);
          setStatus(newStatus);
          setLoading(false);
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setLoading(false);
      }, 120000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate OAuth');
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await calendarApi.syncCalendar(instructorId);

      // Reload status and events
      await loadStatus();

      alert(
        `Sync complete!\n\n` +
        `Events created in Google: ${result.toGoogle.eventsCreated}\n` +
        `External events fetched: ${result.fromGoogle.externalEventsFetched}\n` +
        `Duration: ${(result.durationMs / 1000).toFixed(2)}s`
      );
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await calendarApi.disconnectCalendar(instructorId);
      setStatus(null);
      setExternalEvents([]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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

      {/* Connection Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Google Calendar Connection
        </h3>

        {status?.isConnected ? (
          <div className="space-y-4">
            {/* Connected State */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">Connected</span>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>

            {/* Calendar Info */}
            {status.googleCalendarId && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <span className="text-gray-600">Calendar ID:</span>
                <span className="ml-2 font-mono text-gray-900">{status.googleCalendarId}</span>
              </div>
            )}

            {/* Last Sync Info */}
            {status.lastSyncAt && (
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-600">Last sync:</span>
                  <span className="ml-2 text-gray-900">
                    {new Date(status.lastSyncAt).toLocaleString()}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    status.lastSyncStatus === 'success'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {status.lastSyncStatus}
                </span>
              </div>
            )}

            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={syncing || !status.syncEnabled}
              className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Syncing...
                </span>
              ) : (
                '🔄 Sync Now'
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Not Connected State */}
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">Not Connected</span>
            </div>

            <p className="text-sm text-gray-600">
              Connect Google Calendar to automatically sync lessons and detect conflicts with
              external events.
            </p>

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connecting...' : '🔗 Connect Google Calendar'}
            </button>
          </div>
        )}
      </div>

      {/* External Events */}
      {status?.isConnected && externalEvents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            External Calendar Events ({externalEvents.length})
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            These events from your Google Calendar will be considered when checking for conflicts.
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {externalEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{event.eventTitle}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(event.eventStart).toLocaleString()} →{' '}
                    {new Date(event.eventEnd).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    event.eventStatus === 'confirmed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {event.eventStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Lessons are automatically synced to Google Calendar</li>
          <li>External events are fetched for conflict detection</li>
          <li>Sync happens automatically every 30 minutes (or manually)</li>
          <li>Only future lessons are synced (past lessons are ignored)</li>
        </ul>
      </div>
    </div>
  );
};

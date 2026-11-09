import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { googleCalendarApi } from '@/api';
import { Button } from '@/components/common/Button';

interface GoogleCalendarSyncProps {
  instructorId: string;
}

const STATUS_QUERY_KEY = (instructorId: string) => ['google-calendar-status', instructorId];

/**
 * Lets an instructor connect their own Google account so this app writes
 * their lessons directly into a dedicated "Driving Lessons" calendar it
 * creates in their Google account - additive alongside CalendarFeedSettings'
 * zero-setup ICS subscription, never a replacement for it.
 *
 * One-directional: this app is always the source of truth. Any lesson
 * change overwrites the Google event unconditionally - a manual edit made
 * directly in Google Calendar is silently lost on the next sync. Copy
 * below says this explicitly so instructors aren't surprised. A failed
 * sync for a given lesson is only retried automatically when that lesson
 * itself changes again, or on-demand via "Resync now" - never on a
 * background schedule.
 */
export const GoogleCalendarSync: React.FC<GoogleCalendarSyncProps> = ({ instructorId }) => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: status, isLoading } = useQuery({
    queryKey: STATUS_QUERY_KEY(instructorId),
    queryFn: () => googleCalendarApi.getStatus(instructorId),
  });

  // The OAuth callback redirects back here with ?googleCalendar=connected|denied|error.
  // Captured into state (rather than read directly from searchParams on
  // every render) so the banner stays visible after the effect below
  // strips the query param from the URL - otherwise the banner and its
  // own cleanup would race within the same render pass.
  const [connectResult] = useState(() => searchParams.get('googleCalendar'));
  useEffect(() => {
    if (!connectResult) return;
    queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY(instructorId) });
    const next = new URLSearchParams(searchParams);
    next.delete('googleCalendar');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectMutation = useMutation({
    mutationFn: () => googleCalendarApi.getConsentUrl(instructorId),
    onSuccess: (consentUrl) => {
      if (consentUrl) {
        window.location.href = consentUrl;
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => googleCalendarApi.disconnect(instructorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY(instructorId) });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: () => googleCalendarApi.resync(instructorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY(instructorId) });
    },
  });

  if (isLoading) {
    return (
      <div className="mt-4 bg-surface border border-edge rounded-lg p-4">
        <div className="animate-pulse bg-surface2 rounded-lg p-4">
          <div className="h-4 bg-surface3 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  const connected = status?.connected ?? false;
  const reconnectRequired = status?.reconnectRequired ?? false;

  return (
    <div className="mt-4 bg-surface border border-edge rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-tx-primary">Google Calendar</h2>
        {connected && !reconnectRequired && (
          <span className="text-xs bg-status-success-bg text-status-success-text px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </span>
        )}
        {reconnectRequired && (
          <span className="text-xs bg-status-danger-bg text-status-danger-text px-2 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Reconnect needed
          </span>
        )}
      </div>

      {connectResult === 'denied' && (
        <div className="mb-3 text-sm text-status-warning-text bg-status-warning-bg rounded p-2">
          Google sign-in was cancelled - your lessons are not being synced to Google Calendar.
        </div>
      )}
      {connectResult === 'error' && (
        <div className="mb-3 text-sm text-status-danger-text bg-status-danger-bg rounded p-2">
          Something went wrong connecting your Google Calendar. Please try again.
        </div>
      )}

      {!connected ? (
        <div className="py-2">
          <p className="text-sm text-tx-secondary mb-3">
            Connect your Google account and this app will create a dedicated "Driving Lessons" calendar
            and keep it updated the moment lessons are booked, changed, or cancelled. This app is always
            the source of truth - any edit you make directly in Google Calendar will be overwritten the
            next time that lesson changes here.
          </p>
          <Button onClick={() => connectMutation.mutate()} loading={connectMutation.isPending}>
            <Calendar className="h-4 w-4" />
            Connect Google Calendar
          </Button>
        </div>
      ) : (
        <div className="py-2">
          {reconnectRequired ? (
            <p className="text-sm text-tx-secondary mb-3">
              Google Calendar access was revoked or expired. Reconnect to resume syncing your lessons.
            </p>
          ) : (
            <>
              <p className="text-sm text-tx-secondary mb-1">
                Your lessons are synced to your "Driving Lessons" calendar in Google. This app is always
                the source of truth - a manual edit made directly in Google Calendar will be overwritten
                the next time that lesson changes here.
              </p>
              {status?.lastSyncError && (
                <p className="text-sm text-status-warning-text mb-3">
                  Last sync for one or more lessons failed. A failed lesson is retried automatically only
                  if it changes again - use "Resync now" to retry everything right away.
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            {reconnectRequired ? (
              <Button onClick={() => connectMutation.mutate()} loading={connectMutation.isPending}>
                <Calendar className="h-4 w-4" />
                Reconnect
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => resyncMutation.mutate()}
                loading={resyncMutation.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                Resync now
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => disconnectMutation.mutate()}
              loading={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </div>

          {resyncMutation.isSuccess && (
            <div className="mt-2 text-sm text-status-success-text bg-status-success-bg rounded p-2">
              Resync complete.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleCalendarSync;

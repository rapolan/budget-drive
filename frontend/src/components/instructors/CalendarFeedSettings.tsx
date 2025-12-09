import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Copy, RefreshCw, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { calendarFeedApi } from '@/api';

interface CalendarFeedSettingsProps {
  instructorId: string;
}

export const CalendarFeedSettings: React.FC<CalendarFeedSettingsProps> = ({
  instructorId,
}) => {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  // Fetch calendar feed status
  const { data, isLoading } = useQuery({
    queryKey: ['calendar-feed-status', instructorId],
    queryFn: () => calendarFeedApi.getStatus(instructorId),
  });

  // Setup feed URL mutation
  const setupMutation = useMutation({
    mutationFn: () => calendarFeedApi.setup(instructorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-feed-status', instructorId] });
    },
  });

  // Regenerate feed URL mutation
  const regenerateMutation = useMutation({
    mutationFn: () => calendarFeedApi.regenerate(instructorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-feed-status', instructorId] });
    },
  });

  const feedUrl = data?.feedUrl || '';
  const hasCalendarFeed = data?.hasCalendarFeed || false;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Collapsible header
  const header = (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-blue-600" />
        <span className="font-semibold text-gray-900">Calendar Sync</span>
        {hasCalendarFeed && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
        )}
      </div>
      {expanded ? (
        <ChevronUp className="h-5 w-5 text-gray-500" />
      ) : (
        <ChevronDown className="h-5 w-5 text-gray-500" />
      )}
    </button>
  );

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="animate-pulse bg-gray-100 rounded-lg p-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {header}

      {expanded && (
        <div className="mt-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
          <p className="text-sm text-gray-600 mb-3">
            Subscribe to this instructor's lesson calendar in any calendar app (Google, Apple, Outlook).
            Lessons will automatically appear in their calendar.
          </p>

          {hasCalendarFeed ? (
            <>
              {/* Feed URL */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={feedUrl}
                  title="Calendar feed URL"
                  className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg font-mono text-gray-600 truncate"
                />
                <button
                  type="button"
                  onClick={copyToClipboard}
                  title="Copy URL to clipboard"
                  className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1 ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span className="hidden sm:inline">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span className="hidden sm:inline">Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  {showInstructions ? 'Hide' : 'Show'} Setup Instructions
                </button>
                <button
                  type="button"
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
                >
                  <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                  Regenerate URL
                </button>
              </div>

              {/* Instructions */}
              {showInstructions && (
                <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <span className="text-lg">📱</span> Google Calendar
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Open Google Calendar → Settings → Add calendar → From URL → Paste the URL above
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <span className="text-lg">🍎</span> Apple Calendar
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      File → New Calendar Subscription → Paste the URL above
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <span className="text-lg">📧</span> Microsoft Outlook
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Add Calendar → Subscribe from web → Paste the URL above
                    </p>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      💡 <strong>Tip:</strong> Calendar apps refresh subscribed calendars periodically (usually every 15-60 minutes).
                      New lessons will appear automatically after the next refresh.
                    </p>
                  </div>
                </div>
              )}

              {regenerateMutation.isSuccess && (
                <div className="mt-2 text-sm text-amber-600 bg-amber-50 rounded p-2">
                  ⚠️ URL regenerated. The instructor will need to re-subscribe with the new URL.
                </div>
              )}
            </>
          ) : (
            /* No feed set up yet */
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-3">
                Calendar sync is not set up yet for this instructor.
              </p>
              <button
                type="button"
                onClick={() => setupMutation.mutate()}
                disabled={setupMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
              >
                {setupMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    Enable Calendar Sync
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarFeedSettings;

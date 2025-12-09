import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Copy, RefreshCw, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { calendarFeedApi } from '@/api';

interface CalendarSyncProps {
  instructorId: string;
}

/**
 * Calendar Sync Component
 * Allows instructors to subscribe to their lesson calendar via ICS feed.
 * Works with any calendar app (Google, Apple, Outlook, etc.)
 */
export const CalendarSync: React.FC<CalendarSyncProps> = ({ instructorId }) => {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const queryClient = useQueryClient();

  // Fetch calendar feed status
  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar-feed-status', instructorId],
    queryFn: () => calendarFeedApi.getStatus(instructorId),
    enabled: !!instructorId,
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

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-red-600">
          Failed to load calendar feed status. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Calendar className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Calendar Subscription</h2>
          <p className="text-sm text-gray-500">
            Subscribe to lessons using any calendar app
          </p>
        </div>
        {hasCalendarFeed && (
          <span className="ml-auto text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
            ✓ Active
          </span>
        )}
      </div>

      {/* Description */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>How it works:</strong> Generate a calendar feed URL, then subscribe to it in your preferred calendar app 
          (Google Calendar, Apple Calendar, Outlook, etc.). All scheduled lessons will automatically appear in your calendar 
          and stay updated.
        </p>
      </div>

      {hasCalendarFeed ? (
        <>
          {/* Feed URL */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Calendar Feed URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={feedUrl}
                title="Calendar feed URL"
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-sm text-gray-600 truncate"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                title="Copy URL to clipboard"
                className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 font-medium ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy URL
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Instructions Toggle */}
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors mb-4"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <ExternalLink className="h-4 w-4" />
              Setup Instructions for Calendar Apps
            </span>
            {showInstructions ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {/* Instructions */}
          {showInstructions && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-4 mb-4">
              <div>
                <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-2">
                  <span className="text-xl">📱</span> Google Calendar
                </h4>
                <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1 ml-6">
                  <li>Open Google Calendar in your browser</li>
                  <li>Click the + next to "Other calendars" in the left sidebar</li>
                  <li>Select "From URL"</li>
                  <li>Paste the feed URL and click "Add calendar"</li>
                </ol>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-2">
                  <span className="text-xl">🍎</span> Apple Calendar (Mac/iPhone)
                </h4>
                <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1 ml-6">
                  <li>Open the Calendar app</li>
                  <li>Go to File → New Calendar Subscription (Mac) or Settings → Calendar → Accounts → Add Account → Other (iPhone)</li>
                  <li>Paste the feed URL</li>
                  <li>Click Subscribe</li>
                </ol>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-2">
                  <span className="text-xl">📧</span> Microsoft Outlook
                </h4>
                <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1 ml-6">
                  <li>Open Outlook Calendar</li>
                  <li>Click "Add Calendar" → "Subscribe from web"</li>
                  <li>Paste the feed URL</li>
                  <li>Give it a name and click "Import"</li>
                </ol>
              </div>
              
              <div className="pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <span>
                    <strong>Note:</strong> Calendar apps typically refresh subscribed calendars every 15-60 minutes. 
                    New lessons will appear automatically after the next refresh.
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Regenerate URL */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Need a new URL? Regenerating will invalidate the old one.
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('Are you sure? The instructor will need to re-subscribe with the new URL.')) {
                  regenerateMutation.mutate();
                }
              }}
              disabled={regenerateMutation.isPending}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 flex items-center gap-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
              Regenerate URL
            </button>
          </div>

          {regenerateMutation.isSuccess && (
            <div className="mt-3 text-sm text-amber-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
              ⚠️ URL has been regenerated. The instructor will need to re-subscribe with the new URL.
            </div>
          )}
        </>
      ) : (
        /* No feed set up yet */
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
            <Calendar className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Calendar sync not set up
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Enable calendar sync to generate a feed URL that the instructor can subscribe to in their calendar app.
          </p>
          <button
            type="button"
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto font-medium"
          >
            {setupMutation.isPending ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5" />
                Enable Calendar Sync
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default CalendarSync;

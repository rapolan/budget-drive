import { apiClient } from './client';

export interface CalendarFeedStatus {
  hasCalendarFeed: boolean;
  feedUrl: string | null;
}

export const calendarFeedApi = {
  /**
   * Get the calendar feed status for an instructor
   */
  getStatus: async (instructorId: string): Promise<CalendarFeedStatus> => {
    const response = await apiClient.get(`/calendar-feed/feed/status/${instructorId}`);
    return response.data;
  },

  /**
   * Setup/generate a calendar feed token for an instructor
   */
  setup: async (instructorId: string): Promise<{ feedUrl: string }> => {
    const response = await apiClient.post(`/calendar-feed/feed/setup/${instructorId}`);
    return response.data;
  },

  /**
   * Regenerate the calendar feed token for an instructor
   */
  regenerate: async (instructorId: string): Promise<{ feedUrl: string }> => {
    const response = await apiClient.post(`/calendar-feed/feed/setup/${instructorId}?regenerate=true`);
    return response.data;
  },
};

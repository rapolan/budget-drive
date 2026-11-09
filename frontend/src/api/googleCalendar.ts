import { apiClient } from './client';
import { ApiResponse } from '@/types';

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  reconnectRequired: boolean;
}

export const googleCalendarApi = {
  /**
   * Get the Google Calendar connection status for an instructor
   */
  getStatus: async (instructorId: string): Promise<GoogleCalendarStatus> => {
    const response = await apiClient.get<ApiResponse<GoogleCalendarStatus>>(
      `/google-calendar/status/${instructorId}`
    );
    return (
      response.data.data || {
        connected: false,
        lastSyncAt: null,
        lastSyncError: null,
        reconnectRequired: false,
      }
    );
  },

  /**
   * Starts the OAuth consent flow - returns the Google consent URL to
   * navigate the browser to. Instructor-self only on the backend.
   */
  getConsentUrl: async (instructorId: string): Promise<string> => {
    const response = await apiClient.get<ApiResponse<{ consentUrl: string }>>(
      `/google-calendar/connect/${instructorId}`
    );
    return response.data.data?.consentUrl || '';
  },

  /**
   * Disconnects an instructor's Google Calendar and deletes the
   * dedicated calendar from their Google account.
   */
  disconnect: async (instructorId: string): Promise<void> => {
    await apiClient.post(`/google-calendar/disconnect/${instructorId}`);
  },

  /**
   * Re-syncs every upcoming lesson on demand - a failed sync otherwise
   * only retries automatically when that lesson itself changes again.
   */
  resync: async (instructorId: string): Promise<void> => {
    await apiClient.post(`/google-calendar/resync/${instructorId}`);
  },
};

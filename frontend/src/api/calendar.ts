import { apiClient } from './client';
import { ApiResponse } from '@/types';

/**
 * Google Calendar Integration API
 * Phase 4B - Calendar Sync
 */

export interface CalendarSyncStatus {
  isConnected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'failed' | null;
  syncEnabled: boolean;
  googleCalendarId: string | null;
}

export interface ExternalCalendarEvent {
  id: string;
  instructorId: string;
  googleEventId: string;
  eventTitle: string;
  eventStart: string;
  eventEnd: string;
  eventStatus: string;
  isDeleted: boolean;
}

export interface SyncResult {
  success: boolean;
  toGoogle: {
    eventsCreated: number;
  };
  fromGoogle: {
    externalEventsFetched: number;
  };
  durationMs: number;
}

export const calendarApi = {
  /**
   * Get OAuth authorization URL for Google Calendar
   */
  async getAuthUrl(instructorId: string): Promise<{ authUrl: string; instructorId: string }> {
    const response = await apiClient.get<ApiResponse<{ authUrl: string; instructorId: string }>>(
      `/calendar/oauth/url?instructorId=${instructorId}`
    );
    return response.data.data!;
  },

  /**
   * Trigger manual sync for an instructor
   */
  async syncCalendar(instructorId: string): Promise<SyncResult> {
    const response = await apiClient.post<ApiResponse<SyncResult>>(
      '/calendar/sync',
      { instructorId }
    );
    return response.data.data!;
  },

  /**
   * Get sync status for an instructor
   */
  async getSyncStatus(instructorId: string): Promise<CalendarSyncStatus> {
    const response = await apiClient.get<ApiResponse<CalendarSyncStatus>>(
      `/calendar/status/${instructorId}`
    );
    return response.data.data!;
  },

  /**
   * Disconnect Google Calendar for an instructor
   */
  async disconnectCalendar(instructorId: string): Promise<void> {
    await apiClient.post('/calendar/disconnect', { instructorId });
  },

  /**
   * Get external calendar events for an instructor
   */
  async getExternalEvents(instructorId: string): Promise<ExternalCalendarEvent[]> {
    const response = await apiClient.get<ApiResponse<ExternalCalendarEvent[]>>(
      `/calendar/external-events/${instructorId}`
    );
    return response.data.data || [];
  },
};

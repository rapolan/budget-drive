/**
 * Notifications API Client
 * Endpoints for notification queue management and history
 *
 * Previously used its own bare axios.create() instance with a hardcoded
 * fallback tenant ID and no auth-token interceptor at all - every request
 * silently went out with no Authorization header, so NotificationHistory.tsx
 * always 401'd for a real logged-in user regardless of the notification_queue
 * table itself existing. Switched to the shared apiClient (see ./client.ts),
 * matching every other module in this directory.
 */

import { apiClient } from './client';

export interface NotificationQueueItem {
  id: string;
  lessonId: string;
  notificationType: 'reminder_24h' | 'reminder_1h' | 'booking_confirmation' | 'cancellation';
  recipientEmail: string;
  recipientType: 'student' | 'instructor';
  scheduledSendTime: string;
  sentAt: string | null;
  status: 'pending' | 'sent' | 'failed';
  attemptCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  lessonDate: string;
  lessonTime: string;
  studentName: string;
  instructorName: string;
  createdAt: string;
}

export interface NotificationHistory {
  id: string;
  lessonId: string;
  notificationType: 'reminder_24h' | 'reminder_1h' | 'booking_confirmation' | 'cancellation';
  recipientEmail: string;
  recipientType: 'student' | 'instructor';
  scheduledSendTime: string;
  sentAt: string;
  status: 'sent' | 'failed';
  attemptCount: number;
  errorMessage: string | null;
  lessonDate: string;
  lessonTime: string;
  studentName: string;
  studentEmail: string;
  instructorName: string;
  instructorEmail: string;
}

export interface NotificationStats {
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  totalNotifications: number;
  totalFeesSats: number;
  totalFeesUsd: number;
}

export interface NotificationQueueResponse {
  success: boolean;
  data: NotificationQueueItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface NotificationHistoryResponse {
  success: boolean;
  data: NotificationHistory[];
  stats: NotificationStats;
  pagination: {
    limit: number;
    offset: number;
  };
}

/**
 * Get notification queue (pending/sent/failed)
 */
export const getNotificationQueue = async (
  status?: 'pending' | 'sent' | 'failed',
  limit: number = 100,
  offset: number = 0
): Promise<NotificationQueueResponse> => {
  const params: Record<string, string | number> = { limit, offset };
  if (status) params.status = status;

  const response = await apiClient.get<NotificationQueueResponse>('/notifications/queue', { params });
  return response.data;
};

/**
 * Get notification history with stats
 */
export const getNotificationHistory = async (
  startDate?: string,
  endDate?: string,
  limit: number = 100,
  offset: number = 0
): Promise<NotificationHistoryResponse> => {
  const params: Record<string, string | number> = { limit, offset };
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const response = await apiClient.get<NotificationHistoryResponse>('/notifications/history', { params });
  return response.data;
};

/**
 * Manually trigger notification processor (for testing/admin)
 */
export const processNotificationQueue = async (): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient.post<{ success: boolean; message: string }>('/notifications/process');
  return response.data;
};

/**
 * Retry a failed notification
 */
export const retryNotification = async (notificationId: string): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient.post<{ success: boolean; message: string }>(`/notifications/${notificationId}/retry`);
  return response.data;
};

/**
 * Create a test notification
 */
export const createTestNotification = async (
  email: string,
  sendImmediately: boolean = false
): Promise<{
  success: boolean;
  message: string;
  data: {
    id: string;
    scheduledSendTime: string;
    willSendIn: string;
  };
}> => {
  const response = await apiClient.post('/notifications/test', { email, sendImmediately });
  return response.data;
};

export default {
  getNotificationQueue,
  getNotificationHistory,
  processNotificationQueue,
  retryNotification,
  createTestNotification,
};

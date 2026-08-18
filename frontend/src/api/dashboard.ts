import { apiClient } from './client';
import type { ApiResponse, Lesson } from '@/types';

export interface NoShowAlert {
  studentId: string;
  studentName: string;
  noShowDate: string;
  notificationId: string;
}

export interface ReviewQueueLesson {
  id: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ReviewQueueDay {
  date: string;
  lessons: ReviewQueueLesson[];
  overdue: boolean;
}

export interface ReviewQueueResponse {
  days: ReviewQueueDay[];
  totalCount: number;
}

export const dashboardApi = {
  getNoShowAlerts: async () => {
    const response = await apiClient.get<ApiResponse<NoShowAlert[]>>('/dashboard/no-show-alerts');
    return response.data;
  },

  dismissAlert: async (notificationId: string) => {
    const response = await apiClient.post<ApiResponse<void>>(`/dashboard/alerts/${notificationId}/dismiss`, {});
    return response.data;
  },

  getReviewQueue: async () => {
    const response = await apiClient.get<ApiResponse<ReviewQueueResponse>>('/dashboard/review-queue');
    return response.data;
  },

  completeAllInDay: async (date: string) => {
    const response = await apiClient.post<ApiResponse<Lesson[]>>(`/dashboard/review-queue/${date}/complete-all`, {});
    return response.data;
  },
};

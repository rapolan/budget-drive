import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface NoShowAlert {
  studentId: string;
  studentName: string;
  noShowDate: string;
  notificationId: string;
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
};

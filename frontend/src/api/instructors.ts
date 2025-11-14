import { apiClient } from './client';
import type {
  Instructor,
  CreateInstructorInput,
  ApiResponse,
} from '@/types';

export const instructorsApi = {
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<Instructor[]>>('/instructors');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Instructor>>(`/instructors/${id}`);
    return response.data;
  },

  create: async (data: CreateInstructorInput) => {
    const response = await apiClient.post<ApiResponse<Instructor>>('/instructors', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateInstructorInput>) => {
    const response = await apiClient.put<ApiResponse<Instructor>>(`/instructors/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/instructors/${id}`);
    return response.data;
  },

  getByStatus: async (status: 'active' | 'on_leave' | 'terminated') => {
    const response = await apiClient.get<ApiResponse<Instructor[]>>(`/instructors/status/${status}`);
    return response.data;
  },

  getEarnings: async (id: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await apiClient.get<ApiResponse<{
      totalLessons: number;
      grossEarnings: number;
      totalFees: number;
      netEarnings: number;
    }>>(`/instructors/${id}/earnings?${params.toString()}`);
    return response.data;
  },
};

import { apiClient } from './client';
import type {
  Lesson,
  CreateLessonInput,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

export const lessonsApi = {
  getAll: async (page = 1, limit = 50) => {
    const response = await apiClient.get<PaginatedResponse<Lesson>>(
      `/lessons?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Lesson>>(`/lessons/${id}`);
    return response.data;
  },

  create: async (data: CreateLessonInput) => {
    const response = await apiClient.post<ApiResponse<Lesson>>('/lessons', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateLessonInput>) => {
    const response = await apiClient.put<ApiResponse<Lesson>>(`/lessons/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/lessons/${id}`);
    return response.data;
  },

  getByStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<Lesson[]>>(`/lessons/student/${studentId}`);
    return response.data;
  },

  getByInstructor: async (instructorId: string) => {
    const response = await apiClient.get<ApiResponse<Lesson[]>>(`/lessons/instructor/${instructorId}`);
    return response.data;
  },

  getByStatus: async (status: 'scheduled' | 'completed' | 'cancelled' | 'no_show') => {
    const response = await apiClient.get<ApiResponse<Lesson[]>>(`/lessons/status/${status}`);
    return response.data;
  },

  getByDateRange: async (startDate: string, endDate: string) => {
    const response = await apiClient.get<ApiResponse<Lesson[]>>(
      `/lessons/date-range?startDate=${startDate}&endDate=${endDate}`
    );
    return response.data;
  },

  complete: async (id: string) => {
    const response = await apiClient.post<ApiResponse<Lesson>>(`/lessons/${id}/complete`);
    return response.data;
  },
};

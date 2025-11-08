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
};

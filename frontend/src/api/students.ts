import { apiClient } from './client';
import type {
  Student,
  CreateStudentInput,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

export const studentsApi = {
  getAll: async (page = 1, limit = 50) => {
    const response = await apiClient.get<PaginatedResponse<Student>>(
      `/students?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Student>>(`/students/${id}`);
    return response.data;
  },

  create: async (data: CreateStudentInput) => {
    const response = await apiClient.post<ApiResponse<Student>>('/students', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateStudentInput>) => {
    const response = await apiClient.put<ApiResponse<Student>>(`/students/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/students/${id}`);
    return response.data;
  },

  getByStatus: async (status: 'active' | 'completed' | 'dropped' | 'suspended') => {
    const response = await apiClient.get<ApiResponse<Student[]>>(`/students/status/${status}`);
    return response.data;
  },
};

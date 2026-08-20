import { apiClient } from './client';
import type {
  Student,
  Guardian,
  StudentGuardianLink,
  CreateStudentInput,
  CreateStudentWithGuardianInput,
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

  // Atomically creates a student and creates-or-links one or more guardians
  // in one transaction (backend: POST /students/with-guardian). Use this
  // instead of `create` whenever any guardian is being linked at creation
  // time - never call `create` followed by separate guardian-link requests,
  // even for multiple guardians (that would open N transactions instead
  // of one).
  createWithGuardian: async (data: CreateStudentWithGuardianInput) => {
    const response = await apiClient.post<
      ApiResponse<{ student: Student; guardians: Array<{ guardian: Guardian; link: StudentGuardianLink }> }>
    >('/students/with-guardian', data);
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

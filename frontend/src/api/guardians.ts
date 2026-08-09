import { apiClient } from './client';
import type {
  Guardian,
  GuardianCandidate,
  CreateGuardianInput,
  LinkedGuardian,
  LinkedStudent,
  StudentGuardianLink,
  GuardianRelationship,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

function toQueryString(filter: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export const guardiansApi = {
  getAll: async (page = 1, limit = 50) => {
    const response = await apiClient.get<PaginatedResponse<Guardian>>(
      `/guardians?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Guardian>>(`/guardians/${id}`);
    return response.data;
  },

  create: async (data: CreateGuardianInput) => {
    const response = await apiClient.post<ApiResponse<Guardian>>('/guardians', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateGuardianInput>) => {
    const response = await apiClient.put<ApiResponse<Guardian>>(`/guardians/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/guardians/${id}`);
    return response.data;
  },

  getStudentsForGuardian: async (id: string) => {
    const response = await apiClient.get<ApiResponse<LinkedStudent[]>>(`/guardians/${id}/students`);
    return response.data;
  },

  findCandidates: async (filter: { firstName?: string; lastName?: string; email?: string; phone?: string }) => {
    const response = await apiClient.get<ApiResponse<GuardianCandidate[]>>(
      `/guardians/candidates?${toQueryString(filter)}`
    );
    return response.data;
  },

  findExactMatch: async (filter: { email?: string; phone?: string }) => {
    const response = await apiClient.get<ApiResponse<Guardian[]>>(
      `/guardians/exact-match?${toQueryString(filter)}`
    );
    return response.data;
  },

  linkToStudent: async (
    studentId: string,
    data: { guardianId: string; relationship?: GuardianRelationship; isPrimary?: boolean }
  ) => {
    const response = await apiClient.post<ApiResponse<StudentGuardianLink>>(
      `/students/${studentId}/guardians`,
      data
    );
    return response.data;
  },

  unlinkFromStudent: async (studentId: string, guardianId: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(
      `/students/${studentId}/guardians/${guardianId}`
    );
    return response.data;
  },

  setPrimary: async (studentId: string, guardianId: string) => {
    const response = await apiClient.put<ApiResponse<void>>(
      `/students/${studentId}/guardians/${guardianId}/primary`,
      {}
    );
    return response.data;
  },

  updateRelationship: async (studentId: string, guardianId: string, relationship: GuardianRelationship | null) => {
    const response = await apiClient.put<ApiResponse<StudentGuardianLink>>(
      `/students/${studentId}/guardians/${guardianId}`,
      { relationship }
    );
    return response.data;
  },

  getForStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<LinkedGuardian[]>>(`/students/${studentId}/guardians`);
    return response.data;
  },
};

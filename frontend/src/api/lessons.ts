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

  // Cancels a lesson, recording who reviewed it and when. Replaces the old
  // DELETE /lessons/:id (which had no audit trail and no fee-window check).
  // `allowCorrection` bypasses the backend's terminal-status guard - the
  // one deliberate "I'm choosing a different status than the one already
  // recorded" path (the "Correct" affordance on an already-closed lesson),
  // as opposed to a normal cancel, which must still 409 on a double-click.
  cancel: async (id: string, allowCorrection = false) => {
    const response = await apiClient.post<ApiResponse<Lesson>>(`/lessons/${id}/cancel`, { allowCorrection });
    return response.data;
  },

  getByStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<Lesson[]>>(`/lessons/student/${studentId}`);
    return response.data;
  },

  // A student's single most recent lesson, or null if they have none -
  // powers "Book again" prefill on the student record.
  getMostRecentByStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<Lesson | null>>(
      `/lessons/student/${studentId}/most-recent`
    );
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

  // `allowCorrection`: see cancel()'s note above - same bypass, same
  // "Correct" affordance, same guard on the normal (non-correction) path.
  complete: async (id: string, allowCorrection = false) => {
    const response = await apiClient.post<ApiResponse<Lesson>>(`/lessons/${id}/complete`, { allowCorrection });
    return response.data;
  },

  noShow: async (id: string, allowCorrection = false) => {
    const response = await apiClient.post<ApiResponse<Lesson>>(`/lessons/${id}/no-show`, { allowCorrection });
    return response.data;
  },
};

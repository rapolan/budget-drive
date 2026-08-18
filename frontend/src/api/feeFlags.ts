import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface FeeFlag {
  id: string;
  tenantId: string;
  studentId: string;
  lessonId: string;
  amount: number;
  reason: string;
  status: 'outstanding' | 'cleared' | 'waived' | 'paid';
  waivedBy: string | null;
  waivedReason: string | null;
  waivedAt: string | null;
  paidPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeeFlagForInstructor extends FeeFlag {
  studentName: string;
}

export const feeFlagsApi = {
  getOutstandingForStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<FeeFlag[]>>(`/students/${studentId}/fee-flags`);
    return response.data;
  },

  getForInstructor: async (instructorId: string) => {
    const response = await apiClient.get<ApiResponse<FeeFlagForInstructor[]>>(`/instructors/${instructorId}/fee-flags`);
    return response.data;
  },

  waive: async (id: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<FeeFlag>>(`/fee-flags/${id}/waive`, { reason });
    return response.data;
  },

  recordPayment: async (id: string) => {
    const response = await apiClient.post<ApiResponse<FeeFlag>>(`/fee-flags/${id}/record-payment`, {});
    return response.data;
  },
};

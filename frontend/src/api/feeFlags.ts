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

  // One-click "Paid" for ALL of a student's outstanding fee flags at once -
  // payee-aware per flag server-side (a real payment record per flag for a
  // school-payee tenant, clear-only for instructor-payee), all in one
  // transaction. Used by both the Students list's per-row fee action and
  // the student detail page's actions area.
  markStudentFeesPaid: async (studentId: string) => {
    const response = await apiClient.post<ApiResponse<FeeFlag[]>>(`/students/${studentId}/fee-flags/mark-paid`, {});
    return response.data;
  },
};

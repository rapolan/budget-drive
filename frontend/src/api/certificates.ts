import { apiClient } from './client';
import type { Certificate, ApiResponse } from '@/types';

export interface AwaitingCertificateEntry {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  completedAt: string;
  suggestedInstructorId: string | null;
  suggestedInstructorName: string | null;
}

export interface CertificateCounts {
  issued: number;
  void: number;
}

export interface RecordCertificateInput {
  serialNumber: string;
  issueDate: string;
  issuedByInstructorId?: string | null;
}

export interface RecordVoidInput {
  serialNumber: string;
  voidReason: string;
  issueDate: string;
}

export const certificatesApi = {
  getWorklist: async () => {
    const response = await apiClient.get<ApiResponse<AwaitingCertificateEntry[]>>('/certificates/worklist');
    return response.data;
  },

  getCounts: async () => {
    const response = await apiClient.get<ApiResponse<CertificateCounts>>('/certificates/counts');
    return response.data;
  },

  // No age check - callable for any completed enrollment, worklist or not.
  record: async (enrollmentId: string, data: RecordCertificateInput) => {
    const response = await apiClient.post<ApiResponse<Certificate>>(
      `/enrollments/${enrollmentId}/certificate`,
      data
    );
    return response.data;
  },

  recordVoid: async (data: RecordVoidInput) => {
    const response = await apiClient.post<ApiResponse<Certificate>>('/certificates/void', data);
    return response.data;
  },
};

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

export interface CertificateLogEntry {
  id: string;
  serialNumber: string;
  status: 'issued' | 'void';
  issueDate: string;
  voidReason: string | null;
  studentId: string | null;
  studentName: string | null;
  instructorId: string | null;
  instructorName: string | null;
}

export interface CertificateDetail {
  id: string;
  serialNumber: string;
  formType: string;
  status: 'issued' | 'void';
  issueDateLocal: string;
  school: {
    businessName: string;
    licenseNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
  };
  student: {
    fullName: string;
    dateOfBirthLocal: string | null;
  };
  completionDateLocal: string | null;
  instructor: {
    fullName: string;
    licenseNumber: string | null;
  } | null;
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

  getLog: async () => {
    const response = await apiClient.get<ApiResponse<CertificateLogEntry[]>>('/certificates/log');
    return response.data;
  },

  getDetail: async (id: string) => {
    const response = await apiClient.get<ApiResponse<CertificateDetail>>(`/certificates/${id}`);
    return response.data;
  },

  // Batched - one call for all of a student's enrollments, not N+1.
  getForEnrollments: async (enrollmentIds: string[]) => {
    if (enrollmentIds.length === 0) {
      return { success: true, data: {} as Record<string, Certificate> };
    }
    const response = await apiClient.get<ApiResponse<Record<string, Certificate>>>(
      '/certificates/for-enrollments',
      { params: { enrollmentIds: enrollmentIds.join(',') } }
    );
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

import { apiClient } from './client';
import type { Enrollment, ApiResponse, ProgramType } from '@/types';

export interface CreateEnrollmentInput {
  programType: ProgramType;
  hoursRequired?: number;
  licenseType?: 'car' | 'motorcycle' | 'commercial';
  assignedInstructorId?: string;
  totalCost?: number;
  manualCompletedHours?: number;
  // driver_education only, required at creation - classroom vs online.
  deDeliveryMode?: 'classroom' | 'online';
}

export interface UpdateEnrollmentInput {
  hoursRequired?: number;
  licenseType?: 'car' | 'motorcycle' | 'commercial';
  assignedInstructorId?: string | null;
  totalCost?: number | null;
  trackOverride?: 'hours' | 'lessons' | null;
  externalDeCompleted?: boolean;
  externalDeCompletedDate?: string | null;
  externalDeProvider?: string | null;
  manualCompletedHours?: number | null;
}

export const enrollmentsApi = {
  getForStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<Enrollment[]>>(`/students/${studentId}/enrollments`);
    return response.data;
  },

  create: async (studentId: string, data: CreateEnrollmentInput) => {
    const response = await apiClient.post<ApiResponse<Enrollment>>(`/students/${studentId}/enrollments`, data);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Enrollment>>(`/enrollments/${id}`);
    return response.data;
  },

  update: async (id: string, data: UpdateEnrollmentInput) => {
    const response = await apiClient.patch<ApiResponse<Enrollment>>(`/enrollments/${id}`, data);
    return response.data;
  },

  complete: async (id: string, completionReason?: string) => {
    const response = await apiClient.post<ApiResponse<Enrollment>>(`/enrollments/${id}/complete`, { completionReason });
    return response.data;
  },

  // Guarded write: requires a reason, owner/admin only (enforced server-side).
  reopen: async (id: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<Enrollment & { certificateExists: boolean }>>(
      `/enrollments/${id}/reopen`,
      { reason }
    );
    return response.data;
  },

  // Guarded write: requires a reason, owner/admin only (enforced server-side).
  // Only callable on an active enrollment - completed and withdrawn are
  // mutually exclusive outcomes.
  withdraw: async (id: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<Enrollment>>(
      `/enrollments/${id}/withdraw`,
      { reason }
    );
    return response.data;
  },

  // No age check - a training-received transcript (13 CCR §340.27) is
  // available for any non-completed driver_training enrollment. Returns
  // the raw text body (not the {success,data} envelope - this endpoint
  // serves a downloadable file) plus the server-suggested filename from
  // the Content-Disposition header.
  getWithdrawalTranscript: async (id: string): Promise<{ content: string; filename: string }> => {
    const response = await apiClient.get<Blob>(`/enrollments/${id}/withdrawal-transcript`, {
      responseType: 'blob',
    });
    const disposition = response.headers['content-disposition'] as string | undefined;
    const match = disposition?.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? 'transcript.txt';
    const content = await response.data.text();
    return { content, filename };
  },
};

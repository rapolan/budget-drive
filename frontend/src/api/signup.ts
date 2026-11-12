import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface SignupRequest {
  code: string;
  schoolName: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
  termsAccepted: boolean;
  termsVersion: string;
}

export interface SignupResponse {
  user: { id: string; email: string; fullName: string | null; role: string };
  token: string;
  tenantId: string;
}

export const signupApi = {
  /**
   * Read-only, non-claiming check - safe to call just to show "this
   * looks valid" before the user fills out the whole form. Never marks
   * a code used.
   */
  validateCode: async (code: string): Promise<ApiResponse<{ valid: boolean }>> => {
    const response = await apiClient.post<ApiResponse<{ valid: boolean }>>('/signup/validate-code', { code });
    return response.data;
  },

  signup: async (data: SignupRequest): Promise<ApiResponse<SignupResponse>> => {
    const response = await apiClient.post<ApiResponse<SignupResponse>>('/signup', data);
    return response.data;
  },
};

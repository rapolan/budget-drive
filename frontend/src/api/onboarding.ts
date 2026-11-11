import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface OnboardingStatus {
  onboardingCompletedAt: string | null;
}

export const onboardingApi = {
  getStatus: async (): Promise<ApiResponse<OnboardingStatus>> => {
    const response = await apiClient.get<ApiResponse<OnboardingStatus>>('/onboarding/status');
    return response.data;
  },

  complete: async (): Promise<ApiResponse<null>> => {
    const response = await apiClient.post<ApiResponse<null>>('/onboarding/complete');
    return response.data;
  },
};

import { apiClient } from './client';
import type {
  TenantSettings,
  ApiResponse,
} from '@/types';

export const tenantsApi = {
  getSettings: async () => {
    const response = await apiClient.get<ApiResponse<TenantSettings>>('/tenant/settings');
    return response.data;
  },

  updateSettings: async (id: string, data: Partial<TenantSettings>) => {
    const response = await apiClient.put<ApiResponse<TenantSettings>>(
      `/tenant/settings/${id}`,
      data
    );
    return response.data;
  },
};

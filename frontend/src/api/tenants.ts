import { apiClient } from './client';
import type {
  TenantSettings,
  Tenant,
  ApiResponse,
} from '@/types';

export const tenantsApi = {
  // Get current tenant info (including tenant type)
  getCurrentTenant: async () => {
    const response = await apiClient.get<ApiResponse<Tenant>>('/tenant/current');
    return response.data;
  },

  getSettings: async () => {
    const response = await apiClient.get<ApiResponse<TenantSettings>>('/tenant/settings');
    return response.data;
  },

  updateSettings: async (data: Partial<TenantSettings>) => {
    const response = await apiClient.put<ApiResponse<TenantSettings>>(
      `/tenant/settings`,
      data
    );
    return response.data;
  },
};

import { apiClient } from './client';
import type {
  TenantSettings,
  Tenant,
  ApiResponse,
  BookingEligibilityPreviewRow,
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

  // "Preview: students who couldn't book today" (payment-before-booking
  // safety report) - owner/admin only (server-enforced), read-only, works
  // even while require_payment_before_booking is OFF.
  getBookingEligibilityPreview: async () => {
    const response = await apiClient.get<ApiResponse<BookingEligibilityPreviewRow[]>>(
      '/tenant/booking-eligibility-preview'
    );
    return response.data;
  },
};

import { apiClient } from './client';
import type { ApiResponse } from '@/types';

type UserRole = 'owner' | 'admin' | 'instructor' | 'staff' | 'viewer';

export const usersApi = {
  /**
   * Get all team members for the current tenant
   */
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<any>>('/users');
    return response.data;
  },

  /**
   * Get details for a specific user
   */
  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<any>>(`/users/${id}`);
    return response.data;
  },

  /**
   * Invite a new team member
   */
  invite: async (data: { email: string; role: UserRole | string; fullName?: string; instructorId?: string }) => {
    const response = await apiClient.post<ApiResponse<any>>('/users/invite', data);
    return response.data;
  },

  /**
   * Update a user's membership (role, status)
   */
  update: async (userId: string, data: { role?: UserRole; status?: string; instructorId?: string }) => {
    const response = await apiClient.patch<ApiResponse<any>>(`/users/${userId}`, data);
    return response.data;
  },

  /**
   * INTERIM admin-initiated password reset for ANOTHER team member (owner/
   * admin only, enforced server-side) - no email delivery involved. Returns
   * a freshly generated temporary password the admin must communicate to
   * the teammate themselves (text/call/in person). The real long-term fix
   * is a self-service "forgot password" flow once email sending is built.
   */
  resetPassword: async (userId: string) => {
    const response = await apiClient.post<ApiResponse<{ temporaryPassword: string }>>(`/users/${userId}/reset-password`, {});
    return response.data;
  },

  /**
   * Remove a user from the team
   */
  remove: async (userId: string) => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(`/users/${userId}`);
    return response.data;
  },
};

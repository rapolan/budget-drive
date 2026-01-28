import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
  };
  token: string;
  tenantId: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  profilePhotoUrl: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: string;
  membershipStatus: string;
  instructorId: string | null;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', data);
    return response.data;
  },

  logout: async (): Promise<ApiResponse<void>> => {
    const response = await apiClient.post<ApiResponse<void>>('/auth/logout');
    return response.data;
  },

  getCurrentUser: async (): Promise<ApiResponse<CurrentUser>> => {
    const response = await apiClient.get<ApiResponse<CurrentUser>>('/auth/me');
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<ApiResponse<void>> => {
    const response = await apiClient.post<ApiResponse<void>>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },
};

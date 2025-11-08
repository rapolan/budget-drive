import { apiClient } from './client';
import type {
  Payment,
  CreatePaymentInput,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

export const paymentsApi = {
  getAll: async (page = 1, limit = 50) => {
    const response = await apiClient.get<PaginatedResponse<Payment>>(
      `/payments?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Payment>>(`/payments/${id}`);
    return response.data;
  },

  create: async (data: CreatePaymentInput) => {
    const response = await apiClient.post<ApiResponse<Payment>>('/payments', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreatePaymentInput>) => {
    const response = await apiClient.put<ApiResponse<Payment>>(`/payments/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/payments/${id}`);
    return response.data;
  },

  getByStudent: async (studentId: string) => {
    const response = await apiClient.get<ApiResponse<Payment[]>>(`/payments/student/${studentId}`);
    return response.data;
  },

  getByStatus: async (status: 'pending' | 'confirmed' | 'failed' | 'refunded') => {
    const response = await apiClient.get<ApiResponse<Payment[]>>(`/payments/status/${status}`);
    return response.data;
  },

  getByPaymentMethod: async (paymentMethod: string) => {
    const response = await apiClient.get<ApiResponse<Payment[]>>(`/payments/method/${paymentMethod}`);
    return response.data;
  },

  markAsReceived: async (id: string, bsvTransactionId?: string) => {
    const response = await apiClient.post<ApiResponse<Payment>>(
      `/payments/${id}/received`,
      { bsvTransactionId }
    );
    return response.data;
  },

  refund: async (id: string) => {
    const response = await apiClient.post<ApiResponse<Payment>>(`/payments/${id}/refund`);
    return response.data;
  },
};

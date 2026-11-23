import { apiClient } from './client';
import type {
  Payment,
  CreatePaymentInput,
  ApiResponse,
  PaginatedResponse,
  PaymentPeriodSummary,
  WhoOwesYouRow,
  PaymentReceiptData,
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

  // Payments phase 1 - additive reporting endpoints, read-only.
  getPeriodSummary: async (start: string, end: string) => {
    const response = await apiClient.get<ApiResponse<PaymentPeriodSummary>>(
      '/payments/period-summary',
      { params: { start, end } }
    );
    return response.data;
  },

  getWhoOwesYou: async () => {
    const response = await apiClient.get<ApiResponse<WhoOwesYouRow[]>>('/payments/who-owes-you');
    return response.data;
  },

  getReceipt: async (id: string) => {
    const response = await apiClient.get<ApiResponse<PaymentReceiptData>>(`/payments/${id}/receipt`);
    return response.data;
  },

  // Returns the raw CSV text (Content-Type: text/csv) - the caller builds
  // a downloadable blob from it. Never routed through the normal JSON
  // envelope ({ success, data, message }) - a CSV export is a file, not an
  // API resource.
  exportCsv: async (start: string, end: string) => {
    const response = await apiClient.get<string>('/payments/export', {
      params: { start, end },
      responseType: 'text',
    });
    return response.data;
  },
};

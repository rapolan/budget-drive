import { apiClient } from './client';
import type {
  Vehicle,
  CreateVehicleInput,
  ApiResponse,
} from '@/types';

export const vehiclesApi = {
  getAll: async () => {
    const response = await apiClient.get<ApiResponse<Vehicle[]>>('/vehicles');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Vehicle>>(`/vehicles/${id}`);
    return response.data;
  },

  create: async (data: CreateVehicleInput) => {
    const response = await apiClient.post<ApiResponse<Vehicle>>('/vehicles', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateVehicleInput>) => {
    const response = await apiClient.put<ApiResponse<Vehicle>>(`/vehicles/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/vehicles/${id}`);
    return response.data;
  },

  getByStatus: async (status: 'active' | 'maintenance' | 'retired') => {
    const response = await apiClient.get<ApiResponse<Vehicle[]>>(`/vehicles/status/${status}`);
    return response.data;
  },
};

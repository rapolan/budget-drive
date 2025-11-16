import axios, { AxiosInstance } from 'axios';
import { API_CONFIG } from '@/config/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        const tenantId = localStorage.getItem(API_CONFIG.STORAGE_KEYS.TENANT_ID);
        if (tenantId) {
          config.headers['X-Tenant-ID'] = tenantId;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Redirect to login or clear auth
          localStorage.removeItem(API_CONFIG.STORAGE_KEYS.AUTH_TOKEN);
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  getInstance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient().getInstance();

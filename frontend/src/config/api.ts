/**
 * API Configuration
 * Centralized API settings and constants
 */

export const API_CONFIG = {
  /**
   * Base URL for the API
   * Defaults to localhost:3000 in development
   * Override with VITE_API_URL environment variable
   */
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',

  /**
   * Request timeout in milliseconds
   */
  TIMEOUT: 30000,

  /**
   * Local storage keys
   */
  STORAGE_KEYS: {
    AUTH_TOKEN: 'auth_token',
    TENANT_ID: 'tenant_id',
  },

  /**
   * API endpoints
   */
  ENDPOINTS: {
    // Auth
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',

    // Resources
    STUDENTS: '/students',
    INSTRUCTORS: '/instructors',
    VEHICLES: '/vehicles',
    LESSONS: '/lessons',

    // Availability & Scheduling
    AVAILABILITY: '/availability',

    // Treasury
    TREASURY: '/treasury',

    // Notifications
    NOTIFICATIONS: '/notifications',
  },
} as const;

import { useEffect } from 'react';
import { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

interface ApiErrorResponse {
  message?: string;
  error?: string;
  statusCode?: number;
}

interface UseApiErrorOptions {
  onError?: (error: Error) => void;
  showToast?: boolean;
}

/**
 * Custom hook to handle API errors consistently across the application
 * Provides standardized error logging and optional toast notifications
 */
export const useApiError = (
  query: UseQueryResult<any, any> | UseMutationResult<any, any, any, any>,
  options: UseApiErrorOptions = {}
) => {
  const { onError, showToast = false } = options;

  useEffect(() => {
    if (query.error) {
      const error = query.error as any;

      // Extract error message
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'An unexpected error occurred';

      const statusCode = error?.response?.status;

      // Log error to console with details
      console.error('API Error:', {
        message: errorMessage,
        statusCode,
        endpoint: error?.config?.url,
        method: error?.config?.method,
        fullError: error,
      });

      // Call custom error handler
      if (onError) {
        onError(new Error(errorMessage));
      }

      // Show toast notification if enabled
      if (showToast) {
        // You can integrate with your toast system here
        // Example: toast.error(errorMessage);
        console.log('Would show toast:', errorMessage);
      }
    }
  }, [query.error, onError, showToast]);

  // Return useful error information
  return {
    hasError: !!query.error,
    errorMessage: query.error
      ? (query.error as any)?.response?.data?.message ||
        (query.error as any)?.message ||
        'An error occurred'
      : null,
    statusCode: (query.error as any)?.response?.status,
    isUnauthorized: (query.error as any)?.response?.status === 401,
    isNotFound: (query.error as any)?.response?.status === 404,
    isServerError: (query.error as any)?.response?.status >= 500,
  };
};

/**
 * Format API error for display to users
 */
export const formatApiError = (error: any): string => {
  if (!error) return 'An error occurred';

  // Handle different error formats
  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  if (error.response?.data?.error) {
    return error.response.data.error;
  }

  if (error.message) {
    return error.message;
  }

  // Handle common HTTP status codes
  const status = error.response?.status;
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'You are not authorized. Please log in.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with existing data.';
    case 422:
      return 'Validation error. Please check your input.';
    case 500:
      return 'Server error. Please try again later.';
    case 503:
      return 'Service temporarily unavailable. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

/**
 * Check if error is a network error (no response from server)
 */
export const isNetworkError = (error: any): boolean => {
  return !error.response && error.request;
};

/**
 * Get user-friendly error title based on error type
 */
export const getErrorTitle = (error: any): string => {
  const status = error?.response?.status;

  if (isNetworkError(error)) {
    return 'Connection Error';
  }

  switch (status) {
    case 401:
      return 'Authentication Required';
    case 403:
      return 'Access Denied';
    case 404:
      return 'Not Found';
    case 422:
      return 'Validation Error';
    case 500:
    case 503:
      return 'Server Error';
    default:
      return 'Error';
  }
};

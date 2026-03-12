import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authApi, CurrentUser } from '@/api/auth';

interface AuthContextType {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user;

  // Check if we have a stored token and fetch user info
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Add a 5-second timeout so we never hang forever
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Auth check timed out')), 5000)
    );

    try {
      const response = await Promise.race([authApi.getCurrentUser(), timeout]);
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        // Non-success response (shouldn't happen, but be safe)
        localStorage.removeItem('auth_token');
        localStorage.removeItem('tenant_id');
        setUser(null);
      }
    } catch (err) {
      // Token invalid, expired, network error, or timeout — clear and show login
      localStorage.removeItem('auth_token');
      localStorage.removeItem('tenant_id');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<boolean> => {
    setError(null);
    // NOTE: Do NOT set isLoading here — that shows the full-page spinner.
    // The Login page manages its own isSubmitting state for the button.

    try {
      const response = await authApi.login({ email, password });

      if (response.success && response.data) {
        // Store token and tenant ID
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('tenant_id', response.data.tenantId);

        // Fetch full user info (loads user into state)
        await refreshUser();
        return true;
      } else {
        setError(response.error || 'Login failed');
        return false;
      }
    } catch (err: any) {
      // Extract the most useful error message from the response
      const serverError = err.response?.data?.error;
      const serverMessage = err.response?.data?.message;
      const status = err.response?.status;
      const errorMessage = serverError || serverMessage ||
        (status === 500 ? 'Server error — please try again' : err.message) ||
        'Login failed';
      setError(errorMessage);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('tenant_id');
    setUser(null);
    setError(null);

    authApi.logout().catch(() => {
      // Ignore errors - we're logging out anyway
    });
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

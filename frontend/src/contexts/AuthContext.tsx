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
    if (!token || token === 'dev-token-bypassed-in-development-mode') {
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data);
      }
    } catch (err) {
      // Token invalid or expired - clear it
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
    setIsLoading(true);

    try {
      const response = await authApi.login({ email, password });

      if (response.success && response.data) {
        // Store token and tenant ID
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('tenant_id', response.data.tenantId);

        // Fetch full user info
        await refreshUser();
        return true;
      } else {
        setError(response.error || 'Login failed');
        return false;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Login failed';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Clear stored tokens
    localStorage.removeItem('auth_token');
    localStorage.removeItem('tenant_id');
    setUser(null);
    setError(null);

    // Optionally call server logout endpoint
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

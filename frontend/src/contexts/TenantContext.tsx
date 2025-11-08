import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { tenantsApi } from '@/api';
import type { TenantSettings } from '@/types';

interface TenantContextType {
  settings: TenantSettings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  updateTheme: (settings: TenantSettings) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateTheme = (newSettings: TenantSettings) => {
    // Update CSS variables for theming
    document.documentElement.style.setProperty('--color-primary', newSettings.primaryColor);
    document.documentElement.style.setProperty('--color-secondary', newSettings.secondaryColor);
    document.documentElement.style.setProperty('--color-accent', newSettings.accentColor);

    // Update document title
    const tenantName = localStorage.getItem('tenant_name') || 'Driving School';
    document.title = `${tenantName} - Management System`;
  };

  const refreshSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tenantsApi.getSettings();

      if (response.success && response.data) {
        setSettings(response.data);
        updateTheme(response.data);
      }
    } catch (err: any) {
      console.error('Failed to load tenant settings:', err);
      setError(err.response?.data?.error || 'Failed to load tenant settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  const value: TenantContextType = {
    settings,
    loading,
    error,
    refreshSettings,
    updateTheme,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

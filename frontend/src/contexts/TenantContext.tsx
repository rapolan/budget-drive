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

      // DEBUG: Check localStorage for auth credentials
      console.log('='.repeat(50));
      console.log('🔐 TENANT CONTEXT - REFRESHING SETTINGS');
      console.log('='.repeat(50));
      console.log('AUTH_TOKEN:', localStorage.getItem('auth_token') ? 'Present ✓' : 'MISSING ✗');
      console.log('TENANT_ID:', localStorage.getItem('tenant_id') || 'MISSING ✗');
      console.log('CURRENT SETTINGS STATE:', settings);
      console.log('='.repeat(50));

      const response = await tenantsApi.getSettings();

      if (response.success && response.data) {
        console.log('✅ Settings loaded successfully from API:');
        console.log('   - enable_blockchain_payments:', response.data.enable_blockchain_payments);
        console.log('   - Full data:', response.data);
        console.log('🔄 UPDATING CONTEXT STATE...');
        setSettings(response.data);
        updateTheme(response.data);
        console.log('✅ CONTEXT STATE UPDATED');
      }
    } catch (err: any) {
      console.error('❌ Failed to load tenant settings:', err);
      console.error('Error response:', err.response);
      setError(err.response?.data?.error || 'Failed to load tenant settings');
      // Don't throw - allow app to continue with no settings
      // This prevents infinite loops when not authenticated
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

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { tenantsApi } from '@/api';
import type { TenantSettings, Tenant, TenantType } from '@/types';

interface TenantContextType {
  tenant: Tenant | null;
  tenantType: TenantType;
  settings: TenantSettings | null;
  loading: boolean;
  error: string | null;
  refreshTenant: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  updateTheme: (settings: TenantSettings) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive tenant type with fallback to 'school'
  const tenantType: TenantType = tenant?.tenantType || 'school';

  const updateTheme = (newSettings: TenantSettings) => {
    // Update CSS variables for theming
    document.documentElement.style.setProperty('--color-primary', newSettings.primaryColor);
    document.documentElement.style.setProperty('--color-secondary', newSettings.secondaryColor);
    document.documentElement.style.setProperty('--color-accent', newSettings.accentColor);

    // Update document title
    const tenantName = newSettings.businessName || localStorage.getItem('tenant_name') || 'Driving School';
    document.title = `${tenantName} - Management System`;
  };

  const refreshTenant = async () => {
    try {
      console.log('🔐 TENANT CONTEXT - REFRESHING TENANT INFO');
      const response = await tenantsApi.getCurrentTenant();

      if (response.success && response.data) {
        console.log('✅ Tenant loaded successfully:');
        console.log('   - Name:', response.data.name);
        console.log('   - Type:', response.data.tenantType);
        setTenant(response.data);
      }
    } catch (err: any) {
      console.error('❌ Failed to load tenant:', err);
      // Don't set error - tenant info is optional, settings are primary
    }
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
      console.log('='.repeat(50));

      // Fetch tenant info and settings in parallel
      const [tenantResponse, settingsResponse] = await Promise.all([
        tenantsApi.getCurrentTenant().catch(() => null),
        tenantsApi.getSettings()
      ]);

      // Handle tenant info
      if (tenantResponse?.success && tenantResponse.data) {
        console.log('✅ Tenant info loaded:');
        console.log('   - Name:', tenantResponse.data.name);
        console.log('   - Type:', tenantResponse.data.tenantType);
        setTenant(tenantResponse.data);
      }

      // Handle settings
      if (settingsResponse.success && settingsResponse.data) {
        console.log('✅ Settings loaded successfully from API:');
        console.log('   - enable_blockchain_payments:', settingsResponse.data.enableBlockchainPayments);
        setSettings(settingsResponse.data);
        updateTheme(settingsResponse.data);
      }
    } catch (err: any) {
      console.error('❌ Failed to load tenant settings:', err);
      console.error('Error response:', err.response);
      setError(err.response?.data?.error || 'Failed to load tenant settings');
      // Don't throw - allow app to continue with no settings
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  const value: TenantContextType = {
    tenant,
    tenantType,
    settings,
    loading,
    error,
    refreshTenant,
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

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { tenantsApi } from '@/api';
import type { TenantSettings, Tenant, TenantType } from '@/types';

interface TenantContextType {
  tenant: Tenant | null;
  tenantType: TenantType;
  settings: TenantSettings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  updateTheme: (settings: TenantSettings) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

/** Convert #rrggbb or #rgb to "r, g, b" for use in rgba(). Returns null on invalid input. */
function hexToRgbString(hex: string): string | null {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return null;
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function applyTheme(settings: TenantSettings, tenantName: string) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', settings.primaryColor);

  const pr = hexToRgbString(settings.primaryColor);
  if (pr) root.style.setProperty('--color-primary-rgb', pr);

  document.title = `${tenantName} - Management System`;
}

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantType: TenantType = tenant?.tenantType || 'school';

  const updateTheme = (newSettings: TenantSettings) => {
    const name = tenant?.businessName || localStorage.getItem('tenant_name') || 'Driving School';
    applyTheme(newSettings, name);
  };

  const refreshSettings = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [tenantResponse, settingsResponse] = await Promise.all([
        tenantsApi.getCurrentTenant().catch(() => null),
        tenantsApi.getSettings(),
      ]);

      const resolvedTenant = tenantResponse?.success ? tenantResponse.data ?? null : null;
      if (resolvedTenant) setTenant(resolvedTenant);

      if (settingsResponse.success && settingsResponse.data) {
        setSettings(settingsResponse.data);
        const name = resolvedTenant?.businessName || localStorage.getItem('tenant_name') || 'Driving School';
        applyTheme(settingsResponse.data, name);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tenant settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, tenantType, settings, loading, error, refreshSettings, updateTheme }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) throw new Error('useTenant must be used within a TenantProvider');
  return context;
};

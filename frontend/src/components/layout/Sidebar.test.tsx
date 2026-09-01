import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import type { TenantSettings } from '@/types';

/**
 * Regression coverage: GET /tenant/settings returns every field camelCase
 * (TenantSettings.enableCertificates, .enableBlockchainPayments, etc.) -
 * the same convention as the rest of the API. Sidebar.tsx's feature-flag
 * checks previously read settings.enable_certificates (snake_case),
 * which is always undefined on the real object, so the Certificates nav
 * link never rendered regardless of the flag's actual value - a real bug,
 * found via live diagnosis, not a hypothetical one. This suite pins the
 * fix: reading the camelCase field the API actually serves.
 */

const baseSettings = {
  enableCertificates: false,
  enableBlockchainPayments: false,
  enableFollowUpTracker: false,
  enableDriverEducation: false,
} as unknown as TenantSettings;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, logout: vi.fn() }),
}));

const mockUseTenant = vi.fn();
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => mockUseTenant(),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar - Certificates nav link feature-flag gating', () => {
  beforeEach(() => {
    cleanup();
    mockUseTenant.mockReset();
  });

  it('renders the Certificates link for a school tenant, admin role, with the flag enabled', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, enableCertificates: true },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.getByText('Certificates')).toBeInTheDocument();
  });

  it('hides the Certificates link when the flag is false', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, enableCertificates: false },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.queryByText('Certificates')).not.toBeInTheDocument();
  });

  it('hides the Certificates link when settings has not loaded yet (null)', () => {
    mockUseTenant.mockReturnValue({
      settings: null,
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.queryByText('Certificates')).not.toBeInTheDocument();
  });

  it('hides the Certificates link for an independent (non-school) tenant even with the flag enabled', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, enableCertificates: true },
      tenant: { tenantType: 'independent' },
      tenantType: 'independent',
    });

    renderSidebar();

    expect(screen.queryByText('Certificates')).not.toBeInTheDocument();
  });
});

describe('Sidebar - Classroom nav link feature-flag gating', () => {
  beforeEach(() => {
    cleanup();
    mockUseTenant.mockReset();
  });

  it('renders the Classroom link for a school tenant, admin role, with the flag enabled', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, enableDriverEducation: true },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.getByText('Classroom')).toBeInTheDocument();
  });

  it('hides the Classroom link when the flag is false (off by default)', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, enableDriverEducation: false },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.queryByText('Classroom')).not.toBeInTheDocument();
  });

  it('hides the Classroom link for an independent (non-school) tenant even with the flag enabled', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, enableDriverEducation: true },
      tenant: { tenantType: 'independent' },
      tenantType: 'independent',
    });

    renderSidebar();

    expect(screen.queryByText('Classroom')).not.toBeInTheDocument();
  });
});

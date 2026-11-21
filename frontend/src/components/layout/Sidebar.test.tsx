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

describe('Sidebar - school name in the nav', () => {
  // Regression coverage: tenantName previously read ONLY
  // localStorage.getItem('tenant_name'), which nothing in the frontend
  // ever writes - every school, not just new signups, saw the generic
  // "Driving School" / "My Business" fallback regardless of its real
  // name. Now reads settings.businessName (tenant_settings.business_name,
  // the field a rename in Settings actually writes), falling back to
  // tenant.businessName, then the generic label.
  beforeEach(() => {
    cleanup();
    mockUseTenant.mockReset();
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('shows settings.businessName when present, even if localStorage has nothing', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: 'Riverside Driving School' },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.getByText('Riverside Driving School')).toBeInTheDocument();
  });

  it('falls back to tenant.businessName when settings.businessName is absent', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: undefined },
      tenant: { tenantType: 'school', businessName: 'Fallback Name Co' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.getByText('Fallback Name Co')).toBeInTheDocument();
  });

  it('falls back to the generic school label when neither is present', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: undefined },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    // The top-line name AND the unrelated bottom-line type label (and
    // possibly an image alt text alongside it) all legitimately read
    // "Driving School" in this particular fallback case - at least one
    // match is the real assertion; an exact count isn't the point here.
    expect(screen.getAllByText('Driving School').length).toBeGreaterThan(0);
  });

  it('falls back to "My Business" (not "Driving School") for an independent tenant with no name set', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: undefined },
      tenant: { tenantType: 'independent' },
      tenantType: 'independent',
    });

    renderSidebar();

    expect(screen.getByText('My Business')).toBeInTheDocument();
  });

  it('ignores a stale localStorage tenant_name value entirely', () => {
    localStorage.setItem('tenant_name', 'Stale Cached Name');
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: 'Current Real Name' },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.getByText('Current Real Name')).toBeInTheDocument();
    expect(screen.queryByText('Stale Cached Name')).not.toBeInTheDocument();
  });

  it('shows the correct type label alongside the school name for a school tenant', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: 'Riverside Driving School' },
      tenant: { tenantType: 'school' },
      tenantType: 'school',
    });

    renderSidebar();

    expect(screen.getByText('Riverside Driving School')).toBeInTheDocument();
    expect(screen.getByText('School')).toBeInTheDocument();
  });

  it('shows the correct type label alongside the name for an independent tenant', () => {
    mockUseTenant.mockReturnValue({
      settings: { ...baseSettings, businessName: 'Jane the Instructor' },
      tenant: { tenantType: 'independent' },
      tenantType: 'independent',
    });

    renderSidebar();

    expect(screen.getByText('Jane the Instructor')).toBeInTheDocument();
    expect(screen.getByText('Solo')).toBeInTheDocument();
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

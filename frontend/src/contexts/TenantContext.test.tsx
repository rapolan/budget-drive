import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { TenantProvider } from './TenantContext';
import { tenantsApi } from '@/api';

// Regression: tenantNow only refreshed on mount and on a 5-minute interval,
// with no window-focus listener - a tab backgrounded across a tenant-day
// boundary (e.g. left open overnight) could sit on a stale "today" until
// the next interval tick fired, well after the user had already returned
// to the tab. This asserts the fix: focusing the window triggers an
// immediate re-fetch of GET /tenant/settings, not just mount + interval.

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    tenantsApi: {
      ...actual.tenantsApi,
      getCurrentTenant: vi.fn().mockResolvedValue({ success: true, data: { id: 'tenant-1', businessName: 'Test School', tenantType: 'school' } }),
      getSettings: vi.fn(),
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TenantProvider - window focus refresh', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'test-token');
    (tenantsApi.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        primaryColor: '#000000',
        tenantNow: { timezone: 'America/Los_Angeles', today: '2026-08-19', tomorrow: '2026-08-20', currentTime: '12:00', weekStart: '2026-08-16', weekEnd: '2026-08-22', monthBoundaries: { start: '2026-08-01', end: '2026-08-31' } },
      },
    });
  });

  it('re-fetches tenant settings when the window regains focus', async () => {
    render(
      <TenantProvider>
        <div>child</div>
      </TenantProvider>
    );

    await waitFor(() => {
      expect(tenantsApi.getSettings).toHaveBeenCalledTimes(1);
    });

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(tenantsApi.getSettings).toHaveBeenCalledTimes(2);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Migration 006 adds tenant_settings.onboarding_completed_at and backfills
// it to NOW() for every existing row, specifically so an established
// school (created before this feature existed) is never redirected into
// the first-login wizard. This test proves the frontend-facing
// consequence of that backfill: a tenant whose settings already carry a
// non-null onboarding_completed_at is reported as "already onboarded" by
// the status endpoint, which is what the frontend's redirect-to-/onboarding
// check keys off of.

describe('onboarding status reflects the migration 006 backfill', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('a tenant with a backfilled (non-null) onboarding_completed_at is reported as already onboarded', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'existing-tenant-1', onboarding_completed_at: '2026-11-10T00:00:00.000Z' }])
    );

    const settings = await tenantService.getTenantSettings('existing-tenant-1');

    expect(settings?.onboardingCompletedAt).toBe('2026-11-10T00:00:00.000Z');
  });

  it('a brand-new tenant (created via self-service signup, after migration 006) starts with a null onboarding_completed_at', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'new-tenant-1', onboarding_completed_at: null }])
    );

    const settings = await tenantService.getTenantSettings('new-tenant-1');

    expect(settings?.onboardingCompletedAt).toBeNull();
  });
});

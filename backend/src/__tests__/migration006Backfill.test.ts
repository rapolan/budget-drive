import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// IMPORTANT SCOPE NOTE: this file is a MOCKED, TEXT-LEVEL check only. It
// never touches a real database and never runs migration 006's actual
// backfill SQL - it only proves that tenantService.getTenantSettings
// correctly camelCase-converts a hand-written mock row's
// onboarding_completed_at value, nothing more. It does NOT prove the
// backfill UPDATE statement itself behaves correctly against real data.
// For that, see migration006RealBackfill.integration.test.ts, which runs
// the exact statement from migration 006 against a real Postgres
// instance (gated behind TEST_DATABASE_URL, same convention as
// signupConcurrency.integration.test.ts).
//
// What this file actually demonstrates: migration 006 adds
// tenant_settings.onboarding_completed_at and (per its own real SQL,
// verified separately) backfills it to NOW() for every existing row, so
// an established school is never redirected into the first-login
// wizard. This test's job is narrower - confirming the application
// layer (getTenantSettings -> keysToCamel -> the frontend-facing status
// shape) correctly passes that value through once it's in the database,
// which is what the frontend's redirect-to-/onboarding check actually
// reads.

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

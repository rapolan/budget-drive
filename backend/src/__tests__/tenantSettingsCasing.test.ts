import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Regression test: getTenantSettings/updateTenantSettings returned the raw
// snake_case DB row cast (unsafely) to a camelCase TypeScript type, so every
// camelCase field access (e.g. settings.defaultHoursRequired) was silently
// undefined at runtime. Settings.tsx's "Default Hours Required" field had
// no snake_case fallback (unlike its sibling fields), so it always fell
// through to the hardcoded ?? 6 default regardless of what was saved.
describe('tenantService camelCase conversion', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('getTenantSettings returns defaultHoursRequired in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_hours_required: '8.00' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.defaultHoursRequired).toBe('8.00');
    expect((settings as unknown as { default_hours_required?: string }).default_hours_required).toBeUndefined();
  });

  it('updateTenantSettings returns defaultHoursRequired in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_hours_required: '10.00' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { defaultHoursRequired: 10 });

    expect(settings.defaultHoursRequired).toBe('10.00');
  });
});

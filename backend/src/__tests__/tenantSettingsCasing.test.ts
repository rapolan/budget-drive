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

  it('getTenantSettings returns standardLessonLengthMinutes in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', standard_lesson_length_minutes: 90 }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.standardLessonLengthMinutes).toBe(90);
    expect((settings as unknown as { standard_lesson_length_minutes?: number }).standard_lesson_length_minutes).toBeUndefined();
  });

  it('updateTenantSettings writes standard_lesson_length_minutes when standardLessonLengthMinutes is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', standard_lesson_length_minutes: 90 }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { standardLessonLengthMinutes: 90 });

    expect(settings.standardLessonLengthMinutes).toBe(90);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/standard_lesson_length_minutes\s*=\s*\$/);
    expect(params).toContain(90);
  });

  it('getTenantSettings returns defaultLessonCost in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_lesson_cost: '175.00' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.defaultLessonCost).toBe('175.00');
    expect((settings as unknown as { default_lesson_cost?: string }).default_lesson_cost).toBeUndefined();
  });

  it('updateTenantSettings writes default_lesson_cost when defaultLessonCost is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_lesson_cost: '175.00' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { defaultLessonCost: 175 });

    expect(settings.defaultLessonCost).toBe('175.00');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/default_lesson_cost\s*=\s*\$/);
    expect(params).toContain(175);
  });
});

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

  it('getTenantSettings returns maxLessonsPerStudentPerDay in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', max_lessons_per_student_per_day: 2 }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.maxLessonsPerStudentPerDay).toBe(2);
    expect((settings as unknown as { max_lessons_per_student_per_day?: number }).max_lessons_per_student_per_day).toBeUndefined();
  });

  it('updateTenantSettings writes max_lessons_per_student_per_day when maxLessonsPerStudentPerDay is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', max_lessons_per_student_per_day: 2 }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { maxLessonsPerStudentPerDay: 2 });

    expect(settings.maxLessonsPerStudentPerDay).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/max_lessons_per_student_per_day\s*=\s*\$/);
    expect(params).toContain(2);
  });

  // Phase 1 of the compliance-records arc (docs/compliance-records-build-plan.md):
  // the DMV driving school license number, added to the same
  // tenant_settings table/save flow business_name/address already use.
  it('getTenantSettings returns licenseNumber in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', license_number: 'E1234' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.licenseNumber).toBe('E1234');
    expect((settings as unknown as { license_number?: string }).license_number).toBeUndefined();
  });

  it('getTenantSettings returns licenseNumber as null when never set', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', license_number: null }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.licenseNumber).toBeNull();
  });

  it('updateTenantSettings writes license_number when licenseNumber is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', license_number: 'E1234' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { licenseNumber: 'E1234' });

    expect(settings.licenseNumber).toBe('E1234');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/license_number\s*=\s*\$/);
    expect(params).toContain('E1234');
  });

  // A newly-created tenant's timezone column has no DB default (see
  // backend/database/migrations/011_timezone_default_nullable.sql) - it
  // must round-trip as a real null, not an empty string or the old
  // 'America/Los_Angeles' default, so the frontend can tell "never
  // configured" apart from "explicitly chose Pacific".
  it('getTenantSettings returns timezone as null when never set', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', timezone: null }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.timezone).toBeNull();
  });
});

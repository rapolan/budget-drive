import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Item 2: the four new tenant_settings columns backing the review queue's
// manual/auto mode and the no-show/late-cancellation fee policy. Mirrors
// tenantSettingsCasing.test.ts's existing pattern for the sibling
// max_lessons_per_student_per_day column.
describe('tenantService - lesson review & cancellation policy settings', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('getTenantSettings returns lessonCompletionMode in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', lesson_completion_mode: 'manual' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.lessonCompletionMode).toBe('manual');
  });

  it('updateTenantSettings writes lesson_completion_mode when provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', lesson_completion_mode: 'auto' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { lessonCompletionMode: 'auto' });

    expect(settings.lessonCompletionMode).toBe('auto');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/lesson_completion_mode\s*=\s*\$/);
    expect(params).toContain('auto');
  });

  it('updateTenantSettings rejects an invalid lessonCompletionMode', async () => {
    const tenantService = await import('../services/tenantService');

    await expect(
      tenantService.updateTenantSettings('tenant-1', {
        lessonCompletionMode: 'sometimes' as unknown as 'manual' | 'auto',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updateTenantSettings writes cancellation_fee_amount when provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', cancellation_fee_amount: '75.00' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { cancellationFeeAmount: 75 });

    expect(settings.cancellationFeeAmount).toBe('75.00');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/cancellation_fee_amount\s*=\s*\$/);
    expect(params).toContain(75);
  });

  it('updateTenantSettings writes cancellation_fee_window_hours when provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', cancellation_fee_window_hours: 48 }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { cancellationFeeWindowHours: 48 });

    expect(settings.cancellationFeeWindowHours).toBe(48);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/cancellation_fee_window_hours\s*=\s*\$/);
    expect(params).toContain(48);
  });

  it('updateTenantSettings writes cancellation_fee_payee when provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', cancellation_fee_payee: 'school' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { cancellationFeePayee: 'school' });

    expect(settings.cancellationFeePayee).toBe('school');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/cancellation_fee_payee\s*=\s*\$/);
    expect(params).toContain('school');
  });

  it('updateTenantSettings rejects an invalid cancellationFeePayee', async () => {
    const tenantService = await import('../services/tenantService');

    await expect(
      tenantService.updateTenantSettings('tenant-1', {
        cancellationFeePayee: 'nobody' as unknown as 'instructor' | 'school',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('getTenantSettings returns cancellationFeeAmount/WindowHours/Payee in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        tenant_id: 'tenant-1',
        cancellation_fee_amount: '50.00',
        cancellation_fee_window_hours: 24,
        cancellation_fee_payee: 'instructor',
      }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.cancellationFeeAmount).toBe('50.00');
    expect(settings?.cancellationFeeWindowHours).toBe(24);
    expect(settings?.cancellationFeePayee).toBe('instructor');
  });
});

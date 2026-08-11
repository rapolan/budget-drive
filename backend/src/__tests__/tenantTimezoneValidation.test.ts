import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Regression coverage for item 8: updateTenantSettings must validate an
// incoming timezone against a real IANA zone list before it ever reaches
// the UPDATE query - an invalid string would otherwise be silently
// accepted and only fail later, deep inside date-fns-tz, for every date
// computed for that tenant (scheduling, lesson storage, invites, age).
describe('tenantService.updateTenantSettings - timezone validation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects an invalid timezone with 400 and never issues the UPDATE query', async () => {
    const tenantService = await import('../services/tenantService');

    await expect(
      tenantService.updateTenantSettings('tenant-1', { timezone: 'Not/A_Real_Zone' })
    ).rejects.toThrow('Invalid timezone');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an empty string timezone', async () => {
    const tenantService = await import('../services/tenantService');

    await expect(
      tenantService.updateTenantSettings('tenant-1', { timezone: '' })
    ).rejects.toThrow('Invalid timezone');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts a real IANA zone and writes it through', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', timezone: 'America/New_York' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { timezone: 'America/New_York' });

    expect(settings.timezone).toBe('America/New_York');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/timezone\s*=\s*\$/);
    expect(params).toContain('America/New_York');
  });

  it('accepts a no-DST zone (America/Phoenix)', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', timezone: 'America/Phoenix' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { timezone: 'America/Phoenix' });
    expect(settings.timezone).toBe('America/Phoenix');
  });

  it('leaves timezone untouched when omitted from the patch (undefined, not empty string)', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', business_name: 'Test School' }])
    );

    await tenantService.updateTenantSettings('tenant-1', { businessName: 'Test School' });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toMatch(/timezone/);
  });
});

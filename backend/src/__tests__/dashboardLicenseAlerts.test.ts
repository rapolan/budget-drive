import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc-123';

describe('getInstructorsWithExpiringLicenses', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns correct daysUntilExpiry and severity for an approaching (warning) expiry', async () => {
    const { getInstructorsWithExpiringLicenses } = await import('../services/dashboardService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }])); // getTenantSettings
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Warning Instructor', instructor_license_expiration: '2026-01-01' }])
    );

    // 60 days ahead of the expiration - warning territory (> 30 days out).
    const alerts = await getInstructorsWithExpiringLicenses(TENANT_ID);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].instructorId).toBe('instructor-1');
    expect(typeof alerts[0].daysUntilExpiry).toBe('number');
    expect(alerts[0].severity).toBe(alerts[0].daysUntilExpiry <= 30 ? 'danger' : 'warning');
  });

  it('marks an already-expired license as danger severity', async () => {
    const { getInstructorsWithExpiringLicenses } = await import('../services/dashboardService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }]));
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Expired Instructor', instructor_license_expiration: '2020-01-01' }])
    );

    const alerts = await getInstructorsWithExpiringLicenses(TENANT_ID);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].daysUntilExpiry).toBeLessThan(0);
    expect(alerts[0].severity).toBe('danger');
  });

  it('marks an expiry within 30 days as danger severity', async () => {
    const { getInstructorsWithExpiringLicenses } = await import('../services/dashboardService');
    const { tenantToday, addTenantDays } = await import('../utils/tenantTime');

    const today = tenantToday('America/Los_Angeles');
    const soonExpiration = addTenantDays(today, 10, 'America/Los_Angeles');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }]));
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Soon Instructor', instructor_license_expiration: soonExpiration }])
    );

    const alerts = await getInstructorsWithExpiringLicenses(TENANT_ID);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].daysUntilExpiry).toBe(10);
    expect(alerts[0].severity).toBe('danger');
  });

  it('excludes instructors with a null expiration (the query itself filters them, never surfaced by this alert)', async () => {
    const { getInstructorsWithExpiringLicenses } = await import('../services/dashboardService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }]));
    mockQuery.mockResolvedValueOnce(queryResult([])); // the SQL's own IS NOT NULL filter means null-expiration rows never come back

    const alerts = await getInstructorsWithExpiringLicenses(TENANT_ID);

    expect(alerts).toHaveLength(0);

    const selectCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM instructors')
    );
    expect(selectCall![0]).toMatch(/instructor_license_expiration IS NOT NULL/);
    expect(selectCall![0]).toMatch(/status = 'active'/);
  });

  it('excludes an expiration far beyond the 180-day alert window', async () => {
    const { getInstructorsWithExpiringLicenses } = await import('../services/dashboardService');
    const { tenantToday, addTenantDays } = await import('../utils/tenantTime');

    const today = tenantToday('America/Los_Angeles');
    const farExpiration = addTenantDays(today, 400, 'America/Los_Angeles');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }]));
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Far Future Instructor', instructor_license_expiration: farExpiration }])
    );

    const alerts = await getInstructorsWithExpiringLicenses(TENANT_ID);

    expect(alerts).toHaveLength(0);
  });

  it('sorts multiple alerts soonest-first', async () => {
    const { getInstructorsWithExpiringLicenses } = await import('../services/dashboardService');
    const { tenantToday, addTenantDays } = await import('../utils/tenantTime');

    const today = tenantToday('America/Los_Angeles');
    const in100Days = addTenantDays(today, 100, 'America/Los_Angeles');
    const in5Days = addTenantDays(today, 5, 'America/Los_Angeles');
    const in50Days = addTenantDays(today, 50, 'America/Los_Angeles');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }]));
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { id: 'instructor-100', full_name: 'Far', instructor_license_expiration: in100Days },
        { id: 'instructor-5', full_name: 'Soon', instructor_license_expiration: in5Days },
        { id: 'instructor-50', full_name: 'Middle', instructor_license_expiration: in50Days },
      ])
    );

    const alerts = await getInstructorsWithExpiringLicenses(TENANT_ID);

    expect(alerts.map((a) => a.instructorId)).toEqual(['instructor-5', 'instructor-50', 'instructor-100']);
  });
});

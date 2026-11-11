import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_UUID = '33333333-3333-3333-3333-333333333333';

function signToken(userId: string, tenantId: string, role = 'admin') {
  return jwt.sign({ userId, tenantId, email: `${userId}@example.com`, role }, JWT_SECRET, { expiresIn: '1h' });
}

describe('dashboardService.getGettingStartedCounts', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('parses the four scalar COUNT(*) results as integers (pg returns them as strings)', async () => {
    const dashboardService = await import('../services/dashboardService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_count: '2', vehicle_count: '1', student_count: '15', lesson_count: '42' }])
    );

    const counts = await dashboardService.getGettingStartedCounts(TENANT_UUID);

    expect(counts).toEqual({ instructorCount: 2, vehicleCount: 1, studentCount: 15, lessonCount: 42 });
  });

  it('is tenant-scoped - the tenantId appears in every subquery param slot', async () => {
    const dashboardService = await import('../services/dashboardService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_count: '0', vehicle_count: '0', student_count: '0', lesson_count: '0' }])
    );

    await dashboardService.getGettingStartedCounts(TENANT_UUID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE tenant_id = \$1/g);
    expect(params).toEqual([TENANT_UUID]);
  });

  it('returns all zeros for a brand-new tenant with no data yet', async () => {
    const dashboardService = await import('../services/dashboardService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_count: '0', vehicle_count: '0', student_count: '0', lesson_count: '0' }])
    );

    const counts = await dashboardService.getGettingStartedCounts(TENANT_UUID);

    expect(counts).toEqual({ instructorCount: 0, vehicleCount: 0, studentCount: 0, lessonCount: 0 });
  });
});

describe('GET /api/v1/dashboard/getting-started-counts', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('owner/admin/staff can read it', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID, 'admin');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }])) // requireRole's membership lookup
      .mockResolvedValueOnce(
        queryResult([{ instructor_count: '1', vehicle_count: '0', student_count: '3', lesson_count: '5' }])
      );

    const res = await request(app)
      .get('/api/v1/dashboard/getting-started-counts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ instructorCount: 1, vehicleCount: 0, studentCount: 3, lessonCount: 5 });
  });

  it('instructor gets 403', async () => {
    const { default: app } = await import('../app');
    const token = signToken('instructor-1', TENANT_UUID, 'instructor');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/dashboard/getting-started-counts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(403);
  });
});

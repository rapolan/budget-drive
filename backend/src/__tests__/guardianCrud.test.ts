import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const GUARDIAN_ID = '11111111-1111-1111-1111-111111111111';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('guardian CRUD', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('updates a single field on a guardian', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // 1. pre-check read (email/phone changing) 2. the UPDATE itself
    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID, email: null, phone: '555-0000' }]))
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID, phone: '555-9999' }]));

    const res = await request(app)
      .put(`/api/v1/guardians/${GUARDIAN_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '555-9999' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE guardians')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/phone/);
    expect(params).toContain('555-9999');
  });

  it('updates firstName without touching email/phone (no pre-check read needed)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID, first_name: 'Janet' }])
    );

    const res = await request(app)
      .put(`/api/v1/guardians/${GUARDIAN_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });

    expect(res.status).toBe(200);
    // Only the UPDATE should have run - no pre-check read since
    // email/phone weren't touched.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 with no fields to update and no authenticated user', async () => {
    // updateGuardian's own guard only fires when neither a real field nor a
    // userId is present - an authenticated request always carries userId,
    // so it always has at least `updated_by` to set (matches
    // studentService.updateStudent's identical fields.length===0 shape).
    // Exercise the service directly to isolate the guard from that.
    const guardianService = await import('../services/guardianService');

    await expect(
      guardianService.updateGuardian(GUARDIAN_ID, TENANT_ID, {}, undefined)
    ).rejects.toThrow('No fields to update');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 updating a nonexistent guardian', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // 1. pre-check read (email being changed) - returns nothing, guardian not found
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .put(`/api/v1/guardians/${GUARDIAN_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '555-0000' });

    expect(res.status).toBe(404);
  });

  it('returns 404 getting a nonexistent guardian', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get(`/api/v1/guardians/${GUARDIAN_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('a guardian from tenant A is not returned when queried under tenant B', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(queryResult([])); // tenant B's WHERE never matches tenant A's row

    const result = await guardianService.getGuardianById(GUARDIAN_ID, 'tenant-b-999');
    expect(result).toBeNull();

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/tenant_id\s*=\s*\$2/);
    expect(params).toContain('tenant-b-999');
  });
});

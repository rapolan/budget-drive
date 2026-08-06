import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression coverage for the admin "keep on hours track" / "switch to
// lessons track" actions from the turning-18 alert: PUT /students/:id with
// trackOverride must persist to track_override, and null (explicit clear)
// must behave differently from omitting the field entirely.
describe('PUT /api/v1/students/:id trackOverride', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('sets track_override when trackOverride is provided', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, track_override: 'hours' }])
    );

    const res = await request(app)
      .put(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ trackOverride: 'hours' });

    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/track_override/);
    expect(params).toContain('hours');
  });

  it('clears track_override when trackOverride is explicitly null', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, track_override: null }])
    );

    const res = await request(app)
      .put(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ trackOverride: null });

    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/track_override/);
    expect(params).toContain(null);
  });

  it('does not touch track_override when the field is omitted entirely', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, full_name: 'Renamed' }])
    );

    const res = await request(app)
      .put(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Renamed' });

    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql] = updateCall!;
    expect(sql).not.toMatch(/track_override/);
  });
});

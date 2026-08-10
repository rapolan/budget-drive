import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const basePayload = {
  fullName: 'Test Student',
  email: 'test.student@example.com',
  phone: '555-0100',
  dateOfBirth: '2010-01-01',
};

describe('POST /api/v1/students - tenant default hours', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('inherits the tenant live default_hours_required when hoursRequired is omitted', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // getTenantSettings now runs unconditionally (the age check resolves the
    // tenant's timezone first) and its result is reused for the
    // hoursRequired default - only one tenant_settings lookup total.
    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT_ID, default_hours_required: 8 }])
    ); // getTenantSettings
    mockQuery.mockResolvedValueOnce(queryResult([])); // duplicate-email check
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'student-1', tenant_id: TENANT_ID, hours_required: 8 }])
    ); // INSERT

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.status).toBe(201);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    expect(insertCall).toBeDefined();
    const [, params] = insertCall!;
    expect(params).toContain(8);
  });

  it('an explicit hoursRequired in the payload still wins over the tenant default', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // getTenantSettings still runs (for the age check) even though the
    // explicit hoursRequired means its result is never used for hours.
    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings
    mockQuery.mockResolvedValueOnce(queryResult([])); // duplicate-email check
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'student-1', tenant_id: TENANT_ID, hours_required: 12 }])
    ); // INSERT

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, hoursRequired: 12 });

    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenCalledTimes(3); // getTenantSettings + duplicate-email check + INSERT

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    const [, params] = insertCall!;
    expect(params).toContain(12);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery } from './mocks/database';

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
};

describe('POST /api/v1/students - date of birth required', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects a missing dateOfBirth before touching the database', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dateOfBirth/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an empty-string dateOfBirth', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, dateOfBirth: '' });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts a valid dateOfBirth', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1', default_hours_required: 6 }],
      rowCount: 1,
    }); // getTenantSettings (age check, reused for hoursRequired default)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // duplicate-email check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'student-1', tenant_id: TENANT_ID, date_of_birth: '2010-01-01' }],
      rowCount: 1,
    }); // INSERT

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, dateOfBirth: '2010-01-01' });

    expect(res.status).toBe(201);
  });
});

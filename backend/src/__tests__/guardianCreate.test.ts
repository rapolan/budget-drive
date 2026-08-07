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

describe('POST /api/v1/guardians', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates a guardian with email only', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'guardian-1',
        tenant_id: TENANT_ID,
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: null,
      }])
    );

    const res = await request(app)
      .post('/api/v1/guardians')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('creates a guardian with phone only', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'guardian-2',
        tenant_id: TENANT_ID,
        first_name: 'John',
        last_name: 'Doe',
        email: null,
        phone: '555-0100',
      }])
    );

    const res = await request(app)
      .post('/api/v1/guardians')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John', lastName: 'Doe', phone: '555-0100' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('rejects a guardian with neither email nor phone', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/guardians')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe' });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('creates two guardians with the same email without error (Constraint B: no auto-dedup at write time)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'guardian-3', tenant_id: TENANT_ID, first_name: 'Jane', last_name: 'Doe', email: 'shared@example.com', phone: null }])
    );
    const res1 = await request(app)
      .post('/api/v1/guardians')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'shared@example.com' });
    expect(res1.status).toBe(201);

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'guardian-4', tenant_id: TENANT_ID, first_name: 'John', last_name: 'Doe', email: 'shared@example.com', phone: null }])
    );
    const res2 = await request(app)
      .post('/api/v1/guardians')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'shared@example.com' });
    expect(res2.status).toBe(201);
  });
});

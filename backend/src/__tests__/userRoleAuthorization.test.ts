import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('role authorization on /api/v1/users', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor calling POST /users gets 403', async () => {
    const { default: app } = await import('../app');
    const token = signToken('instructor-1', 'instructor');

    // requireRole's fresh DB lookup: caller's membership is 'instructor'
    mockQuery.mockResolvedValueOnce(
      queryResult([{ role: 'instructor', status: 'active' }])
    );

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newperson@example.com', role: 'staff' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('admin cannot create an owner', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    // 1. requireRole's fresh lookup: caller is an active admin -> passes the route gate
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
    // 2. controller's getCurrentRole lookup (same query shape, called again)
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin' }]));

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newowner@example.com', role: 'owner' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only an owner/i);
  });

  it('owner cannot delete themselves as the last owner', async () => {
    const { default: app } = await import('../app');
    const token = signToken('owner-1', 'owner');

    // requireRole's fresh lookup: caller is an active owner -> passes the route gate
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'owner', status: 'active' }]));

    const res = await request(app)
      .delete('/api/v1/users/owner-1')
      .set('Authorization', `Bearer ${token}`);

    // Controller-level guard rejects self-removal outright, before the
    // service layer's last-owner check would even run
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot remove yourself/i);
  });
});

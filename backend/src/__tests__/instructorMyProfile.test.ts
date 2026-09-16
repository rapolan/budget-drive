import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_A = '11111111-1111-1111-1111-111111111111';

function signToken(userId: string, role?: string, instructorId?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role, instructorId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('GET /api/v1/instructors/me', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns the caller\'s own instructor record', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: INSTRUCTOR_A, tenant_id: TENANT_ID, full_name: 'Pat Instructor' }])
    );

    const res = await request(app)
      .get('/api/v1/instructors/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(INSTRUCTOR_A);
  });

  it('403s when the caller has no linked instructor record', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');

    const res = await request(app)
      .get('/api/v1/instructors/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('404s when the linked instructor record no longer exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get('/api/v1/instructors/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

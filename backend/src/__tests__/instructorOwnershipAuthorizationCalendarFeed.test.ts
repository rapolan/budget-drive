import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_A = '11111111-1111-1111-1111-111111111111';
const INSTRUCTOR_B = '22222222-2222-2222-2222-222222222222';

function signToken(userId: string, role?: string, instructorId?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role, instructorId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('instructor ownership checks on calendar feed routes', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor cannot view another instructor\'s calendar feed status', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    const res = await request(app)
      .get(`/api/v1/calendar-feed/feed/status/${INSTRUCTOR_B}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor cannot set up or regenerate another instructor\'s calendar feed', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    const res = await request(app)
      .post(`/api/v1/calendar-feed/feed/setup/${INSTRUCTOR_B}?regenerate=true`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('instructor CAN view their own calendar feed status', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(queryResult([{ feed_token: 'abc123' }]));

    const res = await request(app)
      .get(`/api/v1/calendar-feed/feed/status/${INSTRUCTOR_A}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('admin can view any instructor\'s calendar feed status', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(queryResult([{ feed_token: 'abc123' }]));

    const res = await request(app)
      .get(`/api/v1/calendar-feed/feed/status/${INSTRUCTOR_B}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

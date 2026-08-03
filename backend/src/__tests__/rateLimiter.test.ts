import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

describe('rate limiter scoping', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('11 rapid GET /auth/me calls all succeed - session checks are not under the strict credential limiter', async () => {
    const { default: app } = await import('../app');
    const token = jwt.sign(
      { userId: 'user-1', tenantId: 'tenant-1', email: 'user@example.com' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    for (let i = 0; i < 11; i++) {
      mockQuery.mockResolvedValueOnce(
        queryResult([{ id: 'user-1', email: 'user@example.com', full_name: 'Test User', role: 'admin' }])
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).not.toBe(429);
    }
  });

  it('the 11th login attempt within the window is rate-limited, the first 10 are not', async () => {
    const { default: app } = await import('../app');

    for (let i = 0; i < 10; i++) {
      mockQuery.mockResolvedValueOnce(queryResult([])); // no user found - fast 401, not the point of this test
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `nobody-${i}@example.com`, password: 'whatever123' });

      expect(res.status).not.toBe(429);
    }

    const eleventh = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody-11@example.com', password: 'whatever123' });

    expect(eleventh.status).toBe(429);
  });
});

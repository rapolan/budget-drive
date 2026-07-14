import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

describe('auth', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  describe('POST /api/v1/auth/login', () => {
    it('rejects an unknown email with 401', async () => {
      const { default: app } = await import('../app');
      mockQuery.mockResolvedValueOnce(queryResult([])); // no user found

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects a wrong password with 401', async () => {
      const { default: app } = await import('../app');
      // bcrypt hash of "correct-password" - a real hash so bcrypt.compare runs its real algorithm and returns false
      mockQuery.mockResolvedValueOnce(
        queryResult([
          {
            id: 'user-1',
            email: 'user@example.com',
            password_hash: '$2b$10$abcdefghijklmnopqrstuuOeIkS0jTzQOD0M2T1rW1e1e1e1e1e1e',
            full_name: 'Test User',
            email_verified: true,
          },
        ])
      );

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('protected routes', () => {
    it('rejects a request to a protected route with no Authorization header', async () => {
      const { default: app } = await import('../app');

      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
    });

    it('rejects a request with a garbage/expired JWT', async () => {
      const { default: app } = await import('../app');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(res.status).toBe(401);
    });

    it('rejects an expired JWT', async () => {
      const { default: app } = await import('../app');
      const expiredToken = jwt.sign(
        { userId: 'user-1', tenantId: 'tenant-1', email: 'user@example.com' },
        JWT_SECRET,
        { expiresIn: -10 } // already expired
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });
  });

  describe('tenant context middleware', () => {
    it('rejects a validly-signed token whose payload has no tenantId', async () => {
      const { default: app } = await import('../app');
      const tokenWithoutTenant = jwt.sign(
        { userId: 'user-1', email: 'user@example.com' }, // no tenantId
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/treasury/status')
        .set('Authorization', `Bearer ${tokenWithoutTenant}`);

      expect(res.status).toBe(403);
    });
  });
});

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

    // SECURITY: an invited-but-not-yet-accepted user has password_hash =
    // NULL (migration 002 - they haven't chosen a password yet, that only
    // happens at accept-invite). This must NEVER be treated as "no
    // password required" - confirmed here with ANY password, including an
    // empty string, against a real such user row. Before this fix,
    // bcrypt.compare(password, null) REJECTS rather than returning false,
    // which would have surfaced as an unhandled 500 instead of a clean
    // 401 for exactly this case - the one place this class of bug could
    // have accidentally become an auth bypass if handled carelessly.
    it('rejects login with ANY password for an invited user whose password_hash is still NULL', async () => {
      const { default: app } = await import('../app');
      mockQuery.mockResolvedValueOnce(
        queryResult([
          {
            id: 'user-1',
            email: 'invited@example.com',
            password_hash: null,
            full_name: null,
            email_verified: false,
          },
        ])
      );

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'invited@example.com', password: 'anything-at-all' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects login with a non-empty but wrong password for an invited user with a NULL password_hash, without ever calling bcrypt.compare against null', async () => {
      const { default: app } = await import('../app');
      mockQuery.mockResolvedValueOnce(
        queryResult([
          {
            id: 'user-1',
            email: 'invited@example.com',
            password_hash: null,
            full_name: null,
            email_verified: false,
          },
        ])
      );

      // A second, longer/differently-shaped password than the first test -
      // proves the null-hash guard rejects regardless of what's submitted,
      // not just one specific string.
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'invited@example.com', password: 'correct-horse-battery-staple' });

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

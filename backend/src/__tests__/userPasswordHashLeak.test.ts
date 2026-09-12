import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// A real-shaped bcrypt hash - not a placeholder string. If any fix here
// were incomplete (e.g. a raw `u.*` re-introduced, or a spread that still
// includes it), this exact string would appear in the JSON response, and
// these tests would catch it by asserting on actual response KEYS, not
// just that the request succeeds.
const REAL_HASH = '$2b$10$abcdefghijklmnopqrstuuOeIkS0jTzQOD0M2T1rW1e1e1e1e1e1e';

// Recursively confirms no object anywhere in the response body has a
// password_hash or passwordHash key, however deeply nested - stronger
// than checking a few named fields, since it also catches a leak inside
// an array item or a nested object a future change might introduce.
function assertNoPasswordHashAnywhere(value: unknown, path = 'body'): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoPasswordHashAnywhere(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      expect(key.toLowerCase()).not.toBe('password_hash');
      expect(key.toLowerCase()).not.toBe('passwordhash');
      assertNoPasswordHashAnywhere(val, `${path}.${key}`);
    }
  }
}

describe('password_hash never leaves the database via a users-table response', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('GET /api/v1/users (team member list) never includes password_hash, even though the underlying row has one', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    // getUsersByTenant's own query - the row genuinely HAS a password_hash
    // at the database level (a real active teammate), proving the fix is
    // in the SELECT's column list, not an accident of empty test data.
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'user-2',
          email: 'teammate@example.com',
          full_name: 'Teammate Person',
          phone: null,
          profile_photo_url: null,
          email_verified: true,
          last_login_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          password_hash: REAL_HASH,
          membership_id: 'membership-2',
          role: 'staff',
          membership_status: 'active',
          instructor_id: null,
          invited_at: null,
          accepted_at: null,
        },
      ])
    );

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    assertNoPasswordHashAnywhere(res.body);
  });

  it('GET /api/v1/users/:id never includes password_hash', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'user-2',
          email: 'teammate@example.com',
          full_name: 'Teammate Person',
          phone: null,
          profile_photo_url: null,
          email_verified: true,
          last_login_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          password_hash: REAL_HASH,
          membership_id: 'membership-2',
          role: 'staff',
          membership_status: 'active',
          instructor_id: null,
          invited_at: null,
          accepted_at: null,
        },
      ])
    );

    const res = await request(app)
      .get('/api/v1/users/user-2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    assertNoPasswordHashAnywhere(res.body);
  });

  it('POST /api/v1/users/invite (re-inviting an EXISTING user with a real password) never includes password_hash', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    // requireRole's fresh lookup - caller is an active admin.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
    // controller's getCurrentRole lookup (same query shape, called again).
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin' }]));
    // inviteUserToTenant's "does this email already exist" lookup - an
    // EXISTING user with a real password_hash (the highest-risk case:
    // re-inviting someone who already has a real account).
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'user-3',
          email: 'existing@example.com',
          full_name: 'Existing Person',
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
          password_hash: REAL_HASH,
        },
      ])
    );
    // the new invited membership INSERT.
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'membership-3',
          user_id: 'user-3',
          tenant_id: TENANT_ID,
          role: 'staff',
          status: 'invited',
          invite_token_hash: 'irrelevant-hash',
        },
      ])
    );

    const res = await request(app)
      .post('/api/v1/users/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'existing@example.com', role: 'staff' });

    expect(res.status).toBe(201);
    assertNoPasswordHashAnywhere(res.body);
  });

  it('POST /api/v1/users (create-and-add, upserting an EXISTING user) never includes password_hash', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    // requireRole's fresh lookup - caller is an active admin.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
    // controller's getCurrentRole lookup.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin' }]));
    // createUserAndAddToTenant's upsert-by-email lookup - existing user,
    // real password_hash.
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'user-4',
          email: 'existing2@example.com',
          full_name: 'Existing Two',
          phone: null,
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
          password_hash: REAL_HASH,
        },
      ])
    );
    // no existing membership for this tenant yet.
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // the new membership INSERT.
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-4', user_id: 'user-4', tenant_id: TENANT_ID, role: 'staff', status: 'active' }])
    );

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'existing2@example.com', role: 'staff' });

    expect(res.status).toBe(201);
    assertNoPasswordHashAnywhere(res.body);
  });
});

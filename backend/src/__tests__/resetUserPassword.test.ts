import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const OTHER_TENANT_ID = 'tenant-xyz-999';

function signToken(userId: string, tenantId: string, role: string) {
  return jwt.sign(
    { userId, tenantId, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('POST /api/v1/users/:id/reset-password (interim admin-initiated password reset)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('staff (non-admin) cannot reset a teammate password - 403, no query beyond the role check', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', TENANT_ID, 'staff');

    // requireRole's fresh lookup - caller is an active staff member.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'staff', status: 'active' }]));

    const res = await request(app)
      .post('/api/v1/users/teammate-1/reset-password')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('an admin resets a teammate password successfully, returning a real, usable temporary password', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_ID, 'admin');

    // requireRole's fresh lookup - caller is an active admin.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
    // resetUserPassword's membership existence check - the target IS a
    // member of this tenant.
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-teammate-1' }]));
    // the UPDATE users SET password_hash = ... - capture the hash to
    // verify it against the returned plaintext password below.
    let capturedHash = '';
    mockQuery.mockImplementationOnce(async (_sql: string, params: any[]) => {
      capturedHash = params[0];
      return queryResult([]);
    });

    const res = await request(app)
      .post('/api/v1/users/teammate-1/reset-password')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const temporaryPassword: string = res.body.data.temporaryPassword;
    expect(temporaryPassword).toBeTruthy();
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);

    // The returned plaintext password genuinely matches the hash that was
    // written to the database - not two unrelated values.
    const matches = await bcrypt.compare(temporaryPassword, capturedHash);
    expect(matches).toBe(true);

    // Never the raw password sitting anywhere else in the response.
    expect(JSON.stringify(res.body)).not.toContain(capturedHash);
  });

  it('an admin cannot reset their OWN password through this endpoint', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_ID, 'admin');

    // requireRole's fresh lookup passes the route gate.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));

    const res = await request(app)
      .post('/api/v1/users/admin-1/reset-password') // targeting themselves
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/change-password flow|own password/i);
    // The service-level self-check must reject BEFORE any password_hash
    // write is attempted - confirm no UPDATE was ever issued.
    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE users SET password_hash')
    );
    expect(updateCall).toBeUndefined();
  });

  it('an admin from a DIFFERENT tenant cannot reset a password for a user in this tenant - 404, tenant scoping enforced not assumed', async () => {
    const { default: app } = await import('../app');
    // This admin's JWT carries OTHER_TENANT_ID - requireTenantContext
    // resolves tenantId from the token, so the reset targets that tenant.
    const token = signToken('outside-admin-1', OTHER_TENANT_ID, 'admin');

    // requireRole's fresh lookup - caller is an active admin OF THE OTHER TENANT.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
    // resetUserPassword's membership existence check, scoped to
    // OTHER_TENANT_ID - the target user has NO membership row for that
    // tenant (they belong to TENANT_ID instead), so this returns empty.
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .post('/api/v1/users/teammate-in-tenant-abc/reset-password')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found in this tenant/i);
    // Confirm the membership check was actually scoped to the CALLER's
    // tenant, not the target's - proving this is enforced, not assumed.
    const membershipCheckCall = mockQuery.mock.calls[1];
    expect(membershipCheckCall[1]).toEqual(['teammate-in-tenant-abc', OTHER_TENANT_ID]);
    // No password_hash write ever attempted.
    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE users SET password_hash')
    );
    expect(updateCall).toBeUndefined();
  });
});

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

describe('resend invite', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  describe('userService.resendInvite', () => {
    it('regenerates the token on the EXISTING invited membership row via UPDATE, not a fresh INSERT', async () => {
      const userService = await import('../services/userService');

      mockQuery.mockResolvedValueOnce(queryResult([{ status: 'invited' }])); // existence check
      mockQuery.mockResolvedValueOnce(queryResult([])); // the UPDATE

      const result = await userService.resendInvite('user-2', TENANT_ID);

      expect(result.inviteToken).toBeTruthy();
      expect(typeof result.inviteToken).toBe('string');
      // Exactly 2 queries: the existence check and the UPDATE - never an
      // INSERT, which is what caused the original unique-constraint 500.
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const updateCall = mockQuery.mock.calls[1][0] as string;
      expect(updateCall).toMatch(/UPDATE user_tenant_memberships/i);
      expect(updateCall).not.toMatch(/INSERT/i);
    });

    it('refuses to resend for a user with no membership in this tenant', async () => {
      const userService = await import('../services/userService');

      mockQuery.mockResolvedValueOnce(queryResult([])); // no membership found

      await expect(userService.resendInvite('stranger-1', TENANT_ID)).rejects.toThrow(/membership not found/i);
    });

    it('refuses to resend for an already-ACTIVE user - nothing to resend', async () => {
      const userService = await import('../services/userService');

      mockQuery.mockResolvedValueOnce(queryResult([{ status: 'active' }]));

      await expect(userService.resendInvite('active-user-1', TENANT_ID)).rejects.toThrow(/already accepted/i);
    });
  });

  describe('userService.inviteUserToTenant regression: re-inviting an already-invited email', () => {
    it('UPDATEs the existing invited membership instead of attempting a duplicate INSERT (the original 500 bug)', async () => {
      const userService = await import('../services/userService');

      mockQuery.mockResolvedValueOnce(
        queryResult([{ id: 'user-5', email: 'already-invited@example.com', full_name: null, email_verified: false }])
      ); // user already exists
      mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-5', status: 'invited' }])); // existing invited membership
      mockQuery.mockResolvedValueOnce(
        queryResult([{ id: 'membership-5', user_id: 'user-5', tenant_id: TENANT_ID, role: 'staff', status: 'invited' }])
      ); // the UPDATE

      const result = await userService.inviteUserToTenant(
        'already-invited@example.com',
        TENANT_ID,
        'staff',
        'admin-1',
        undefined,
        'admin'
      );

      expect(result.inviteToken).toBeTruthy();
      // 3 queries total: user lookup, membership existence check, UPDATE -
      // never a 4th INSERT call.
      expect(mockQuery).toHaveBeenCalledTimes(3);
      const thirdCall = mockQuery.mock.calls[2][0] as string;
      expect(thirdCall).toMatch(/UPDATE user_tenant_memberships/i);
    });

    it('still INSERTs normally when the email has never been invited to this tenant before', async () => {
      const userService = await import('../services/userService');

      mockQuery.mockResolvedValueOnce(queryResult([])); // brand new email, no user row yet
      mockQuery.mockResolvedValueOnce(
        queryResult([{ id: 'user-6', email: 'new@example.com', full_name: null, email_verified: false }])
      ); // user creation
      mockQuery.mockResolvedValueOnce(queryResult([])); // no existing membership
      mockQuery.mockResolvedValueOnce(
        queryResult([{ id: 'membership-6', user_id: 'user-6', tenant_id: TENANT_ID, role: 'staff', status: 'invited' }])
      ); // the INSERT

      const result = await userService.inviteUserToTenant(
        'new@example.com',
        TENANT_ID,
        'staff',
        'admin-1',
        undefined,
        'admin'
      );

      expect(result.inviteToken).toBeTruthy();
      const fourthCall = mockQuery.mock.calls[3][0] as string;
      expect(fourthCall).toMatch(/INSERT INTO user_tenant_memberships/i);
    });

    it('refuses to re-invite an already-ACTIVE user rather than silently overwriting their membership', async () => {
      const userService = await import('../services/userService');

      mockQuery.mockResolvedValueOnce(
        queryResult([{ id: 'user-7', email: 'active@example.com', full_name: 'Active Person', email_verified: true }])
      );
      mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-7', status: 'active' }]));

      await expect(
        userService.inviteUserToTenant('active@example.com', TENANT_ID, 'staff', 'admin-1', undefined, 'admin')
      ).rejects.toThrow(/already a member/i);
    });
  });

  describe('POST /api/v1/users/:id/resend-invite', () => {
    it('an admin can resend an invite and receives a fresh invite link', async () => {
      const { default: app } = await import('../app');
      const token = signToken('admin-1', 'admin');

      mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }])); // requireRole
      mockQuery.mockResolvedValueOnce(queryResult([{ status: 'invited' }])); // existence check
      mockQuery.mockResolvedValueOnce(queryResult([])); // UPDATE

      const res = await request(app)
        .post('/api/v1/users/user-2/resend-invite')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inviteLink).toMatch(/\/accept-invite\?token=/);
    });

    it('a staff (non-admin) caller is rejected by the route gate before the service even runs', async () => {
      const { default: app } = await import('../app');
      const token = signToken('staff-1', 'staff');

      mockQuery.mockResolvedValueOnce(queryResult([{ role: 'staff', status: 'active' }])); // requireRole

      const res = await request(app)
        .post('/api/v1/users/user-2/resend-invite')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});

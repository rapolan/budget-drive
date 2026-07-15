import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

describe('userService.inviteUserToTenant token generation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns a raw invite token and stores only its hash', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing user
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'user-1', email: 'invitee@example.com' }])); // insert user
    mockQuery.mockImplementationOnce(async (_sql: string, params: any[]) => {
      return queryResult([{
        id: 'membership-1',
        user_id: 'user-1',
        tenant_id: TENANT_ID,
        role: 'staff',
        status: 'invited',
        invite_token_hash: params[5],
      }]);
    });

    const result = await userService.inviteUserToTenant(
      'invitee@example.com',
      TENANT_ID,
      'staff',
      'inviter-1'
    );

    expect(result.inviteToken).toBeDefined();
    expect(result.inviteToken).toHaveLength(64); // 32 bytes hex

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO user_tenant_memberships')
    );
    expect(insertCall).toBeDefined();
    const storedHash = insertCall![1][5];
    expect(storedHash).not.toBe(result.inviteToken);
    expect(storedHash).toBe(hashToken(result.inviteToken));
  });

  it('only an owner can invite someone as owner', async () => {
    const userService = await import('../services/userService');

    await expect(
      userService.inviteUserToTenant('invitee@example.com', TENANT_ID, 'owner', 'inviter-1', undefined, 'admin')
    ).rejects.toThrow(/only an owner/i);

    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('userService.acceptInvite', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('happy path: valid token sets a bcrypt password and activates the membership', async () => {
    const userService = await import('../services/userService');
    const rawToken = 'a'.repeat(64);
    const tokenHash = hashToken(rawToken);

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'membership-1',
        user_id: 'user-1',
        tenant_id: TENANT_ID,
        role: 'staff',
        status: 'invited',
        invite_token_hash: tokenHash,
        invite_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day from now
      }])
    );

    let insertedHash = '';
    mockQuery.mockImplementationOnce(async (_sql: string, params: any[]) => {
      insertedHash = params[0];
      return queryResult([]);
    });

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-1', user_id: 'user-1', tenant_id: TENANT_ID, role: 'staff', status: 'active' }])
    );

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'user-1', email: 'invitee@example.com', membership_id: 'membership-1', role: 'staff', membership_status: 'active' }])
    );

    const result = await userService.acceptInvite(rawToken, 'new-password-123');

    expect(insertedHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await bcrypt.compare('new-password-123', insertedHash)).toBe(true);
    expect(result.membershipStatus ?? (result as any).status).toBeDefined();
  });

  it('rejects an expired token', async () => {
    const userService = await import('../services/userService');
    const rawToken = 'b'.repeat(64);
    const tokenHash = hashToken(rawToken);

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'membership-1',
        user_id: 'user-1',
        tenant_id: TENANT_ID,
        role: 'staff',
        status: 'invited',
        invite_token_hash: tokenHash,
        invite_token_expires_at: new Date(Date.now() - 1000 * 60 * 60), // 1 hour in the past
      }])
    );

    await expect(userService.acceptInvite(rawToken, 'new-password-123')).rejects.toThrow(/expired/i);
  });

  it('rejects an unknown token', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // no matching membership

    await expect(userService.acceptInvite('nonexistent-token', 'new-password-123')).rejects.toThrow(
      /invalid or already-used/i
    );
  });
});

describe('POST /api/v1/auth/accept-invite', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('accepts a valid invite and returns 200', async () => {
    const { default: app } = await import('../app');
    const rawToken = 'c'.repeat(64);
    const tokenHash = hashToken(rawToken);

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'membership-1',
        user_id: 'user-1',
        tenant_id: TENANT_ID,
        role: 'staff',
        status: 'invited',
        invite_token_hash: tokenHash,
        invite_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
      }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // update users password_hash
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-1', user_id: 'user-1', tenant_id: TENANT_ID, role: 'staff', status: 'active' }])
    );
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'user-1', email: 'invitee@example.com', membership_id: 'membership-1', role: 'staff', membership_status: 'active' }])
    );

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: rawToken, password: 'new-password-123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects an expired invite with 400', async () => {
    const { default: app } = await import('../app');
    const rawToken = 'd'.repeat(64);
    const tokenHash = hashToken(rawToken);

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'membership-1',
        user_id: 'user-1',
        tenant_id: TENANT_ID,
        role: 'staff',
        status: 'invited',
        invite_token_hash: tokenHash,
        invite_token_expires_at: new Date(Date.now() - 1000 * 60 * 60),
      }])
    );

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: rawToken, password: 'new-password-123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });
});

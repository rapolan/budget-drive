import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';

describe('userService.createUserAndAddToTenant password hashing', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('stores a bcrypt hash, not the raw password, and bcrypt.compare succeeds against it', async () => {
    const userService = await import('../services/userService');

    const rawPassword = 'super-secret-password-123';

    // 1. SELECT * FROM users WHERE email = $1 -> no existing user
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 2. INSERT INTO users (...) RETURNING * -> capture the params to inspect the hash
    mockQuery.mockImplementationOnce(async (_sql: string, params: any[]) => {
      const insertedHash = params[3]; // email, full_name, phone, password_hash
      return queryResult([
        {
          id: 'user-1',
          email: 'newuser@example.com',
          full_name: null,
          phone: null,
          password_hash: insertedHash,
          email_verified: false,
        },
      ]);
    });
    // 3. SELECT * FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2 -> no existing membership
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 4. INSERT INTO user_tenant_memberships (...) RETURNING *
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'membership-1',
          user_id: 'user-1',
          tenant_id: TENANT_ID,
          role: 'staff',
          status: 'active',
        },
      ])
    );

    await userService.createUserAndAddToTenant(
      TENANT_ID,
      { email: 'newuser@example.com', password: rawPassword },
      'staff'
    );

    // Find the INSERT INTO users call and inspect the password_hash param
    const insertUsersCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users')
    );
    expect(insertUsersCall).toBeDefined();

    const insertedHash = insertUsersCall![1][3];

    expect(insertedHash).not.toBe(rawPassword);
    expect(insertedHash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash format
    expect(insertedHash).toHaveLength(60); // fixed bcrypt hash length

    const matches = await bcrypt.compare(rawPassword, insertedHash);
    expect(matches).toBe(true);
  });

  it('does not hash or store anything when no password is provided (invite-style creation)', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing user
    mockQuery.mockImplementationOnce(async (_sql: string, params: any[]) => {
      return queryResult([
        {
          id: 'user-2',
          email: 'nopassword@example.com',
          password_hash: params[3],
        },
      ]);
    });
    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing membership
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-2', user_id: 'user-2', tenant_id: TENANT_ID, role: 'staff', status: 'active' }])
    );

    await userService.createUserAndAddToTenant(TENANT_ID, { email: 'nopassword@example.com' }, 'staff');

    const insertUsersCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO users')
    );
    expect(insertUsersCall![1][3]).toBeNull();
  });
});

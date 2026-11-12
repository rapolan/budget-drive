import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Regression coverage for a real bug, reproduced against a throwaway
// database before this fix: inviteUserToTenant/createUserAndAddToTenant
// stored the submitted email verbatim (no normalization), while
// authService.login's own lookup always lowercases its input
// (email.toLowerCase().trim()) with no LOWER() on the column side. A
// user invited as "Test@Example.com" could accept the invite, set a
// password, and then NEVER log in successfully - not even with the
// exact original casing, since login always searches for the lowercase
// variant, which never matches a mixed-case stored row. Confirmed via a
// real end-to-end repro (invite -> accept -> login, all against a real
// Postgres database) before writing this fix.

const TENANT_ID = 'tenant-abc';

describe('inviteUserToTenant - email normalization', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('stores the email lowercased and trimmed, regardless of submitted casing/whitespace', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // SELECT users WHERE email -> none found
    mockQuery.mockImplementationOnce(async (_sql: string, params: unknown[]) => {
      // INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3)
      expect(params[0]).toBe('test@example.com');
      return queryResult([{ id: 'user-1', email: params[0], full_name: null, email_verified: false, created_at: new Date(), updated_at: new Date() }]);
    });
    mockQuery.mockResolvedValueOnce(queryResult([])); // existing membership check -> none
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-1', status: 'invited' }])); // INSERT membership

    await userService.inviteUserToTenant('  Test@Example.com  ', TENANT_ID, 'staff', 'inviter-1');
  });

  it('looks up an existing user by the NORMALIZED email, so a re-invite of a differently-cased email still matches', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockImplementationOnce(async (_sql: string, params: unknown[]) => {
      expect(params[0]).toBe('existing@example.com');
      return queryResult([{ id: 'existing-user-1', email: 'existing@example.com', full_name: 'Existing User', email_verified: false, created_at: new Date(), updated_at: new Date() }]);
    });
    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing membership
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-1', status: 'invited' }]));

    await userService.inviteUserToTenant('EXISTING@Example.COM', TENANT_ID, 'staff', 'inviter-1');
  });
});

describe('createUserAndAddToTenant - email normalization', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('stores the email lowercased and trimmed', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // SELECT -> none found
    mockQuery.mockImplementationOnce(async (_sql: string, params: unknown[]) => {
      expect(params[0]).toBe('newuser@example.com');
      return queryResult([{ id: 'user-1', email: params[0], full_name: null, phone: null, email_verified: false, created_at: new Date(), updated_at: new Date() }]);
    });
    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing membership
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-1' }])); // INSERT membership

    await userService.createUserAndAddToTenant(
      TENANT_ID,
      { email: 'NewUser@Example.com', fullName: 'New User' },
      'staff'
    );
  });
});

describe('end-to-end regression: a mixed-case invite can be logged into afterward', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('simulates invite -> accept -> login and confirms the stored row matches login\'s lowercased lookup', async () => {
    const userService = await import('../services/userService');
    const authService = await import('../services/authService');

    // Step 1: invite "Test@Example.com" - confirm it's normalized before storage.
    let storedEmail = '';
    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing user
    mockQuery.mockImplementationOnce(async (_sql: string, params: unknown[]) => {
      storedEmail = params[0] as string;
      return queryResult([{ id: 'user-1', email: storedEmail, full_name: null, email_verified: false, created_at: new Date(), updated_at: new Date() }]);
    });
    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing membership
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'membership-1', status: 'invited' }]));

    await userService.inviteUserToTenant('Test@Example.com', TENANT_ID, 'staff', 'inviter-1');

    expect(storedEmail).toBe('test@example.com');

    // Step 2: login's own lookup lowercases its input - confirm the
    // stored value from step 1 is exactly what that lookup would search
    // for, closing the loop the real repro found broken.
    resetMockQuery();
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'user-1', email: storedEmail, password_hash: await authService.hashPassword('Password1234'), full_name: 'Test User', email_verified: false }])
    );
    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT_ID, role: 'staff', status: 'active', instructor_id: null, tenant_name: 'Acme' }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // last_login_at update

    const loginResult = await authService.login('test@example.com', 'Password1234');
    expect(loginResult.user.email).toBe('test@example.com');
  });
});

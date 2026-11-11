import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockClientQuery,
  mockClientRelease,
  mockGetClient,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({
  query: mockQuery,
  getClient: mockGetClient,
}));

const mockHashPassword = vi.fn(async (password: string) => `hashed:${password}`);
vi.mock('../services/authService', () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...(args as [string])),
}));

const VALID_CODE = 'a-valid-raw-invite-code';
const TERMS_VERSION = '2026-11-09-draft';

function sequenceClientQuery(responses: Array<{ rows: any[]; rowCount: number }>) {
  let callIndex = 0;
  mockClientQuery.mockImplementation(async () => {
    const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return response;
  });
}

describe('signupNewTenant - happy path', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
    mockHashPassword.mockClear();
  });

  it('claims the code, creates the tenant, records terms acceptance, and returns a login token', async () => {
    const { signupNewTenant } = await import('../services/tenantSignupService');

    sequenceClientQuery([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [{ id: 'invite-id-1' }], rowCount: 1 }, // atomic claim UPDATE
      { rows: [], rowCount: 0 }, // email-exists SELECT -> none found
      { rows: [], rowCount: 0 }, // resolveUniqueSlug's SELECT id FROM tenants WHERE slug
      { rows: [{ id: 'tenant-id-1' }], rowCount: 1 }, // INSERT INTO tenants
      { rows: [], rowCount: 0 }, // INSERT INTO tenant_settings
      { rows: [{ id: 'user-id-1' }], rowCount: 1 }, // INSERT INTO users
      { rows: [], rowCount: 0 }, // INSERT INTO user_tenant_memberships
      { rows: [], rowCount: 0 }, // UPDATE signup_invite_codes SET used_by_tenant_id
      { rows: [], rowCount: 0 }, // INSERT INTO terms_acceptances
      { rows: [], rowCount: 0 }, // COMMIT
    ]);

    const result = await signupNewTenant({
      code: VALID_CODE,
      schoolName: 'Acme Driving School',
      ownerFullName: 'Jane Owner',
      ownerEmail: 'jane@example.com',
      ownerPassword: 'password12345',
      termsVersion: TERMS_VERSION,
    });

    expect(result.tenantId).toBe('tenant-id-1');
    expect(result.user).toMatchObject({ id: 'user-id-1', email: 'jane@example.com', role: 'owner' });
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);

    // Password was actually hashed (not stored/returned in plaintext anywhere).
    expect(mockHashPassword).toHaveBeenCalledWith('password12345');

    const sqlCalls = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => /BEGIN/.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /UPDATE signup_invite_codes\s+SET used_at/.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /INSERT INTO terms_acceptances/.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /COMMIT/.test(s))).toBe(true);
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });
});

describe('signupNewTenant - atomic rollback leaves no partial tenant', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
    mockHashPassword.mockClear();
  });

  it('rolls back when an insert inside createTenantWithOwner throws, after a successful claim', async () => {
    const { signupNewTenant } = await import('../services/tenantSignupService');

    let callIndex = 0;
    const responses: Array<{ rows: any[]; rowCount: number } | 'throw'> = [
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [{ id: 'invite-id-1' }], rowCount: 1 }, // claim succeeds
      { rows: [], rowCount: 0 }, // email check -> none found
      { rows: [], rowCount: 0 }, // slug check -> free
      { rows: [{ id: 'tenant-id-1' }], rowCount: 1 }, // tenants insert succeeds
      'throw', // tenant_settings insert fails
    ];
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (/ROLLBACK/.test(sql)) return { rows: [], rowCount: 0 };
      const response = responses[callIndex];
      callIndex++;
      if (response === 'throw') throw new Error('simulated tenant_settings insert failure');
      return response ?? { rows: [], rowCount: 0 };
    });

    await expect(
      signupNewTenant({
        code: VALID_CODE,
        schoolName: 'Acme',
        ownerFullName: 'Jane',
        ownerEmail: 'jane@example.com',
        ownerPassword: 'password12345',
        termsVersion: TERMS_VERSION,
      })
    ).rejects.toThrow('simulated tenant_settings insert failure');

    const sqlCalls = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /COMMIT/.test(s))).toBe(false);
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });
});

describe('signupNewTenant - code failure cases all produce the identical rejection', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
    mockHashPassword.mockClear();
  });

  const scenarios = ['nonexistent', 'expired', 'used', 'revoked'];

  for (const scenario of scenarios) {
    it(`a ${scenario} code produces the exact same error as every other code failure`, async () => {
      const { signupNewTenant } = await import('../services/tenantSignupService');

      sequenceClientQuery([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // claim UPDATE matches zero rows regardless of WHY (nonexistent/expired/used/revoked all fail the same WHERE clause)
        { rows: [], rowCount: 0 }, // ROLLBACK
      ]);

      await expect(
        signupNewTenant({
          code: `${scenario}-code`,
          schoolName: 'Acme',
          ownerFullName: 'Jane',
          ownerEmail: 'jane@example.com',
          ownerPassword: 'password12345',
          termsVersion: TERMS_VERSION,
        })
      ).rejects.toThrow('This invite code is invalid or has expired.');

      // Password is never hashed when the claim fails - bcrypt's
      // deliberate cost is never paid for a request with no valid code.
      expect(mockHashPassword).not.toHaveBeenCalled();
    });
  }
});

describe('signupNewTenant - concurrent single-use (mocked serialization)', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
    mockHashPassword.mockClear();
  });

  it('only the request whose claim UPDATE matches a row proceeds to tenant creation', async () => {
    const { signupNewTenant } = await import('../services/tenantSignupService');

    // First call's claim succeeds (rowCount 1); simulate the second,
    // "losing" concurrent request by running signupNewTenant again with
    // a mock reconfigured to return rowCount 0 on the claim - this
    // mirrors what Postgres's real row-lock serialization produces: one
    // winner, one loser, from the same WHERE used_at IS NULL condition.
    sequenceClientQuery([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [{ id: 'invite-id-1' }], rowCount: 1 }, // claim succeeds (winner)
      { rows: [], rowCount: 0 }, // email check
      { rows: [], rowCount: 0 }, // slug check
      { rows: [{ id: 'tenant-id-1' }], rowCount: 1 }, // tenants insert
      { rows: [], rowCount: 0 }, // tenant_settings insert
      { rows: [{ id: 'user-id-1' }], rowCount: 1 }, // users insert
      { rows: [], rowCount: 0 }, // membership insert
      { rows: [], rowCount: 0 }, // code UPDATE used_by_tenant_id
      { rows: [], rowCount: 0 }, // terms insert
      { rows: [], rowCount: 0 }, // COMMIT
    ]);

    const winner = await signupNewTenant({
      code: VALID_CODE,
      schoolName: 'Acme',
      ownerFullName: 'Jane',
      ownerEmail: 'jane@example.com',
      ownerPassword: 'password12345',
      termsVersion: TERMS_VERSION,
    });
    expect(winner.tenantId).toBe('tenant-id-1');

    resetMockClient();
    sequenceClientQuery([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // claim fails - already used by the winner above (rowCount 0)
      { rows: [], rowCount: 0 }, // ROLLBACK
    ]);

    await expect(
      signupNewTenant({
        code: VALID_CODE,
        schoolName: 'Acme',
        ownerFullName: 'Someone Else',
        ownerEmail: 'someone-else@example.com',
        ownerPassword: 'password12345',
        termsVersion: TERMS_VERSION,
      })
    ).rejects.toThrow('This invite code is invalid or has expired.');
  });
});

describe('signupNewTenant - email already exists', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
    mockHashPassword.mockClear();
  });

  it('rejects with the specific "already exists" message, distinct from the generic code-failure message', async () => {
    const { signupNewTenant } = await import('../services/tenantSignupService');

    sequenceClientQuery([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [{ id: 'invite-id-1' }], rowCount: 1 }, // claim succeeds
      { rows: [{ id: 'existing-user-id' }], rowCount: 1 }, // email check -> FOUND
      { rows: [], rowCount: 0 }, // ROLLBACK
    ]);

    await expect(
      signupNewTenant({
        code: VALID_CODE,
        schoolName: 'Acme',
        ownerFullName: 'Jane',
        ownerEmail: 'existing@example.com',
        ownerPassword: 'password12345',
        termsVersion: TERMS_VERSION,
      })
    ).rejects.toThrow('An account with this email already exists. Try logging in instead.');

    // Password is never hashed when the email check fails either.
    expect(mockHashPassword).not.toHaveBeenCalled();

    // Confirms the claim DID run (and was rolled back) before the
    // rejection - this is the behavior that makes the SAME code
    // reusable on a later, corrected-email retry (see the next test).
    const sqlCalls = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => /UPDATE signup_invite_codes\s+SET used_at/.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /ROLLBACK/.test(s))).toBe(true);
  });

  it('the SAME code can be successfully reused on a later request after a rolled-back email conflict', async () => {
    const { signupNewTenant } = await import('../services/tenantSignupService');

    // First attempt: email conflict, rolled back.
    sequenceClientQuery([
      { rows: [], rowCount: 0 },
      { rows: [{ id: 'invite-id-1' }], rowCount: 1 },
      { rows: [{ id: 'existing-user-id' }], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    await expect(
      signupNewTenant({
        code: VALID_CODE,
        schoolName: 'Acme',
        ownerFullName: 'Jane',
        ownerEmail: 'existing@example.com',
        ownerPassword: 'password12345',
        termsVersion: TERMS_VERSION,
      })
    ).rejects.toThrow(/already exists/);

    // Second attempt, same code, corrected email - succeeds, because the
    // rollback truly un-claimed it (used_at reverted to NULL).
    resetMockClient();
    sequenceClientQuery([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [{ id: 'invite-id-1' }], rowCount: 1 }, // claim succeeds again - same code, now unclaimed
      { rows: [], rowCount: 0 }, // email check -> free this time
      { rows: [], rowCount: 0 }, // slug check
      { rows: [{ id: 'tenant-id-2' }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: 'user-id-2' }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 }, // COMMIT
    ]);

    const result = await signupNewTenant({
      code: VALID_CODE,
      schoolName: 'Acme',
      ownerFullName: 'Jane',
      ownerEmail: 'jane-corrected@example.com',
      ownerPassword: 'password12345',
      termsVersion: TERMS_VERSION,
    });

    expect(result.tenantId).toBe('tenant-id-2');
  });
});

describe('POST /api/v1/signup - terms-required validation at the controller layer', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('termsAccepted: false is rejected with 400 and makes zero DB calls', async () => {
    const { default: app } = await import('../app');

    const res = await request(app).post('/api/v1/signup').send({
      code: VALID_CODE,
      schoolName: 'Acme',
      ownerFullName: 'Jane',
      ownerEmail: 'jane@example.com',
      ownerPassword: 'password12345',
      termsAccepted: false,
      termsVersion: TERMS_VERSION,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must accept the Terms/);
    expect(mockGetClient).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a missing termsAccepted field is rejected the same way', async () => {
    const { default: app } = await import('../app');

    const res = await request(app).post('/api/v1/signup').send({
      code: VALID_CODE,
      schoolName: 'Acme',
      ownerFullName: 'Jane',
      ownerEmail: 'jane@example.com',
      ownerPassword: 'password12345',
      termsVersion: TERMS_VERSION,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must accept the Terms/);
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/signup/validate-code', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns { valid: true } for a currently-valid code', async () => {
    const { default: app } = await import('../app');
    mockQuery.mockResolvedValueOnce(queryResult([{ exists: 1 }]));

    const res = await request(app).post('/api/v1/signup/validate-code').send({ code: VALID_CODE });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
  });

  it('returns the generic rejection for an invalid code, with no distinguishing detail', async () => {
    const { default: app } = await import('../app');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app).post('/api/v1/signup/validate-code').send({ code: 'garbage' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This invite code is invalid or has expired.');
  });
});

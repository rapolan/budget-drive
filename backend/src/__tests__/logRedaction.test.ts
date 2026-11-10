import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mockQuery, resetMockQuery } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Regression coverage: errorLoggingMiddleware used to pass req.body/query/
// params straight into logApiError with no redaction - a failed login or
// failed signup logged the submitted plaintext password/invite code
// verbatim into this app's logs, which (per the existing BSV wallet-key
// safety precedent, docs/ARCHITECTURE.md §23) persist indefinitely on this
// app's hosting platform. redactSensitive (utils/redact.ts) is now applied
// before logging; these tests prove it actually fires on a real request
// through the real middleware chain, not just in isolation.

describe('redactSensitive - unit', () => {
  it('redacts known sensitive keys (password, token, code, authorization, secret)', async () => {
    const { redactSensitive } = await import('../utils/redact');
    const result = redactSensitive({
      password: 'super-secret-123',
      ownerPassword: 'another-secret',
      currentPassword: 'x',
      newPassword: 'y',
      code: 'abc123def456',
      token: 'jwt-token-value',
      authorization: 'Bearer abc',
      secret: 'shh',
    }) as Record<string, string>;

    for (const key of Object.keys(result)) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('redacts a key only matching the generic /pass|token|secret|code/i pattern', async () => {
    const { redactSensitive } = await import('../utils/redact');
    const result = redactSensitive({ apiSecretKey: 'value', passPhrase: 'value', accessToken: 'value' }) as Record<string, string>;
    expect(result.apiSecretKey).toBe('[REDACTED]');
    expect(result.passPhrase).toBe('[REDACTED]');
    expect(result.accessToken).toBe('[REDACTED]');
  });

  it('does NOT redact zipCode/zip_code/postalCode - "code" in the name is a false positive for an address field', async () => {
    const { redactSensitive } = await import('../utils/redact');
    const result = redactSensitive({ zipCode: '90210', zip_code: '90210', postalCode: '90210' }) as Record<string, string>;
    expect(result.zipCode).toBe('90210');
    expect(result.zip_code).toBe('90210');
    expect(result.postalCode).toBe('90210');
  });

  it('does not over-redact a non-sensitive field', async () => {
    const { redactSensitive } = await import('../utils/redact');
    const result = redactSensitive({ email: 'a@example.com', schoolName: 'Acme Driving' }) as Record<string, string>;
    expect(result.email).toBe('a@example.com');
    expect(result.schoolName).toBe('Acme Driving');
  });

  it('recurses into nested objects and arrays', async () => {
    const { redactSensitive } = await import('../utils/redact');
    const result = redactSensitive({
      user: { email: 'a@example.com', password: 'secret' },
      items: [{ token: 'abc' }, { zipCode: '12345' }],
    }) as any;
    expect(result.user.email).toBe('a@example.com');
    expect(result.user.password).toBe('[REDACTED]');
    expect(result.items[0].token).toBe('[REDACTED]');
    expect(result.items[1].zipCode).toBe('12345');
  });
});

describe('errorLoggingMiddleware - no plaintext secrets reach the logs on a real request', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMockQuery();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('a failed login never logs the submitted plaintext password', async () => {
    const { default: app } = await import('../app');
    const submittedPassword = 'a-very-distinctive-plaintext-password-xyz987';

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no user found -> AppError(401)

    await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: submittedPassword });

    const allLoggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(allLoggedText).not.toContain(submittedPassword);
  });

  // A matching "failed signup never logs the plaintext password/code"
  // test is added alongside POST /signup itself once that route exists
  // (see signupFlow.test.ts) - this file covers the redaction mechanism
  // generically (the unit tests above) and against the one credential
  // endpoint that already exists today (login).
});

describe('sanity: errorLoggingMiddleware does actually log something on a 401', () => {
  it('console.error is called at least once for a failed login (proves the redaction test above is not vacuous)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetMockQuery();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { default: app } = await import('../app');
    await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'whatever123' });
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

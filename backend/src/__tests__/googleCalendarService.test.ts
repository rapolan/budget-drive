import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import type { GoogleCalendarConnectionRow } from '../services/googleCalendarService';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Mocks the @googleapis/calendar and google-auth-library clients so these
// tests exercise this app's own connection-management logic (state
// verification, token encryption/storage, 409/invalid_grant handling)
// without making a real network call to Google.
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockGetAccessToken = vi.fn();
let mockCredentials: Record<string, unknown> = {};

const mockGenerateAuthUrl = vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1');

interface MockOAuth2ClientInstance {
  getToken: typeof mockGetToken;
  setCredentials: (creds: Record<string, unknown>) => void;
  getAccessToken: typeof mockGetAccessToken;
  generateAuthUrl: typeof mockGenerateAuthUrl;
  credentials: Record<string, unknown>;
}

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function (this: MockOAuth2ClientInstance) {
    this.getToken = mockGetToken;
    this.setCredentials = (creds: Record<string, unknown>) => {
      mockCredentials = creds;
      mockSetCredentials(creds);
    };
    this.getAccessToken = mockGetAccessToken;
    this.generateAuthUrl = mockGenerateAuthUrl;
    Object.defineProperty(this, 'credentials', {
      get: () => mockCredentials,
    });
  }),
}));

const mockCalendarsInsert = vi.fn();
const mockCalendarsDelete = vi.fn();

vi.mock('@googleapis/calendar', () => ({
  calendar: vi.fn(() => ({
    calendars: {
      insert: mockCalendarsInsert,
      delete: mockCalendarsDelete,
    },
  })),
}));

const ORIGINAL_ENV = { ...process.env };
const VALID_KEY_HEX = 'a'.repeat(64);
const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';

function setValidGoogleEnv() {
  process.env.DB_PASSWORD = 'test-password';
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
  process.env.GOOGLE_OAUTH_STATE_SECRET = 'state-secret-distinct-from-jwt';
  process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
}

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe('googleOAuthState.ts - signing/verifying the OAuth state parameter', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    setValidGoogleEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  it('round-trips instructorId/tenantId through sign then verify', async () => {
    const { signOAuthState, verifyOAuthState } = await import('../utils/googleOAuthState');
    const state = signOAuthState({ instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID });
    const decoded = verifyOAuthState(state);
    expect(decoded).toEqual({ instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID });
  });

  it('rejects a state signed with a different secret (e.g. JWT_SECRET, never interchangeable)', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { verifyOAuthState } = await import('../utils/googleOAuthState');

    const wrongSecretState = jwt.sign(
      { instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID },
      process.env.JWT_SECRET!,
      { expiresIn: '10m' }
    );

    expect(() => verifyOAuthState(wrongSecretState)).toThrow();
  });

  it('rejects an expired state', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { verifyOAuthState } = await import('../utils/googleOAuthState');

    const expiredState = jwt.sign(
      { instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID },
      process.env.GOOGLE_OAUTH_STATE_SECRET!,
      { expiresIn: '-1s' }
    );

    expect(() => verifyOAuthState(expiredState)).toThrow();
  });

  it('rejects a well-signed but malformed payload (missing instructorId/tenantId)', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { verifyOAuthState } = await import('../utils/googleOAuthState');

    const malformedState = jwt.sign({ foo: 'bar' }, process.env.GOOGLE_OAUTH_STATE_SECRET!, { expiresIn: '10m' });

    expect(() => verifyOAuthState(malformedState)).toThrow(/Malformed OAuth state payload/);
  });

  it('throws when GOOGLE_OAUTH_STATE_SECRET is not configured, rather than silently signing with no secret', async () => {
    // config/env.ts's own module-level startup check (the first of the two
    // defensive boundaries - see config/env.ts) throws on import before
    // googleOAuthState.ts's own getStateSecret() check is ever reached,
    // since GOOGLE_OAUTH_CLIENT_ID is still set here. This confirms the
    // outer boundary actually fires - see the encryption.ts equivalent in
    // googleCalendarEncryption.test.ts for the same two-boundary pattern.
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    vi.resetModules();
    await expect(import('../utils/googleOAuthState')).rejects.toThrow(
      /GOOGLE_OAUTH_STATE_SECRET is not configured/
    );
  });
});

describe('googleCalendarService.ts - buildConsentUrl', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    resetMockQuery();
    setValidGoogleEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  it('requests only the narrow calendar.app.created scope', async () => {
    mockGenerateAuthUrl.mockClear();
    const { buildConsentUrl, CALENDAR_APP_CREATED_SCOPE } = await import('../services/googleCalendarService');
    const url = buildConsentUrl(INSTRUCTOR_ID, TENANT_ID);

    expect(CALENDAR_APP_CREATED_SCOPE).toBe('https://www.googleapis.com/auth/calendar.app.created');
    expect(typeof url).toBe('string');
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ scope: [CALENDAR_APP_CREATED_SCOPE] })
    );
  });

  it('throws a 503 AppError when Google OAuth is not configured for this environment', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    vi.resetModules();
    const { buildConsentUrl } = await import('../services/googleCalendarService');
    expect(() => buildConsentUrl(INSTRUCTOR_ID, TENANT_ID)).toThrow(
      /Google Calendar sync is not configured for this environment/
    );
  });
});

describe('googleCalendarService.ts - handleOAuthCallback', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    resetMockQuery();
    setValidGoogleEnv();
    mockGetToken.mockReset();
    mockCalendarsInsert.mockReset();
    mockCalendarsDelete.mockReset();
    mockGetAccessToken.mockReset();
    mockCredentials = {};
  });

  afterEach(() => {
    resetEnv();
  });

  async function signValidState() {
    const { signOAuthState } = await import('../utils/googleOAuthState');
    return signOAuthState({ instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID });
  }

  it('rejects an invalid/expired state before ever calling Google', async () => {
    const { handleOAuthCallback } = await import('../services/googleCalendarService');
    await expect(handleOAuthCallback('some-code', 'not-a-real-state')).rejects.toThrow();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('throws when Google does not return a refresh_token', async () => {
    const state = await signValidState();
    mockGetToken.mockResolvedValueOnce({
      tokens: { access_token: 'at', expiry_date: Date.now() + 3600_000 }, // no refresh_token
    });

    const { handleOAuthCallback } = await import('../services/googleCalendarService');
    await expect(handleOAuthCallback('code', state)).rejects.toThrow(
      /Google did not return a complete token set/
    );
  });

  it('on a first connection, creates a dedicated calendar and stores encrypted tokens', async () => {
    const state = await signValidState();
    mockGetToken.mockResolvedValueOnce({
      tokens: { access_token: 'raw-access-token', refresh_token: 'raw-refresh-token', expiry_date: Date.now() + 3600_000 },
    });
    mockCalendarsInsert.mockResolvedValueOnce({ data: { id: 'new-google-calendar-id' } });

    resetMockQuery();
    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getConnectionRow - no existing row
      .mockResolvedValueOnce(queryResult([{ business_name: 'ABC Driving School', timezone: 'America/New_York' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])); // INSERT

    const { handleOAuthCallback } = await import('../services/googleCalendarService');
    const result = await handleOAuthCallback('code', state);

    expect(result).toEqual({ instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID });
    expect(mockCalendarsInsert).toHaveBeenCalledTimes(1);

    const insertCall = mockQuery.mock.calls.find(call => String(call[0]).includes('INSERT INTO google_calendar_connections'));
    expect(insertCall).toBeDefined();
    const insertParams = insertCall![1] as string[];
    // Stored tokens must never be the raw plaintext - must be the
    // encrypted, version-prefixed ciphertext format.
    expect(insertParams).not.toContain('raw-access-token');
    expect(insertParams).not.toContain('raw-refresh-token');
    expect(insertParams.some(p => typeof p === 'string' && p.startsWith('v1.'))).toBe(true);
  });

  it('on a reconnect (existing row), reuses the existing calendar id and does not create a new calendar', async () => {
    const state = await signValidState();
    mockGetToken.mockResolvedValueOnce({
      tokens: { access_token: 'at2', refresh_token: 'rt2', expiry_date: Date.now() + 3600_000 },
    });

    resetMockQuery();
    mockQuery
      .mockResolvedValueOnce(queryResult([{
        id: 'row-1',
        tenant_id: TENANT_ID,
        instructor_id: INSTRUCTOR_ID,
        google_calendar_id: 'existing-calendar-id',
        encrypted_access_token: 'v1.a.b.c',
        encrypted_refresh_token: 'v1.d.e.f',
        access_token_expires_at: new Date(),
        last_sync_at: null,
        last_sync_error: null,
        connected_at: new Date(),
        updated_at: new Date(),
      }])) // getConnectionRow - existing
      .mockResolvedValueOnce(queryResult([])); // UPDATE

    const { handleOAuthCallback } = await import('../services/googleCalendarService');
    await handleOAuthCallback('code', state);

    expect(mockCalendarsInsert).not.toHaveBeenCalled();
    const updateCall = mockQuery.mock.calls.find(call => String(call[0]).includes('UPDATE google_calendar_connections'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('existing-calendar-id');
  });
});

describe('googleCalendarService.ts - getStatus', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    resetMockQuery();
    setValidGoogleEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  it('reports not connected when no row exists', async () => {
    mockQuery.mockResolvedValueOnce(queryResult([]));
    const { getStatus } = await import('../services/googleCalendarService');
    const status = await getStatus(INSTRUCTOR_ID, TENANT_ID);
    expect(status).toEqual({ connected: false, lastSyncAt: null, lastSyncError: null, reconnectRequired: false });
  });

  it('reports reconnectRequired true when last_sync_error is the reconnect sentinel', async () => {
    mockQuery.mockResolvedValueOnce(queryResult([{
      id: 'row-1',
      tenant_id: TENANT_ID,
      instructor_id: INSTRUCTOR_ID,
      google_calendar_id: 'cal-1',
      encrypted_access_token: 'v1.a.b.c',
      encrypted_refresh_token: 'v1.d.e.f',
      access_token_expires_at: new Date(),
      last_sync_at: null,
      last_sync_error: 'reconnect_required',
      connected_at: new Date(),
      updated_at: new Date(),
    }]));

    const { getStatus, RECONNECT_REQUIRED_SENTINEL } = await import('../services/googleCalendarService');
    const status = await getStatus(INSTRUCTOR_ID, TENANT_ID);
    expect(status.connected).toBe(true);
    expect(status.reconnectRequired).toBe(true);
    expect(status.lastSyncError).toBe(RECONNECT_REQUIRED_SENTINEL);
  });
});

describe('googleCalendarService.ts - getAuthenticatedClient token refresh', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    resetMockQuery();
    setValidGoogleEnv();
    mockGetAccessToken.mockReset();
    mockCredentials = {};
  });

  afterEach(() => {
    resetEnv();
  });

  function connectionRow(overrides: Partial<GoogleCalendarConnectionRow> = {}): GoogleCalendarConnectionRow {
    return {
      id: 'row-1',
      tenantId: TENANT_ID,
      instructorId: INSTRUCTOR_ID,
      googleCalendarId: 'cal-1',
      encryptedAccessToken: '', // filled per-test below with a real encrypted value
      encryptedRefreshToken: '',
      accessTokenExpiresAt: new Date(),
      lastSyncAt: null,
      lastSyncError: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('persists a refreshed access token when the client rotates one', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const row = connectionRow({
      encryptedAccessToken: encryptToken('old-access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
    });

    mockGetAccessToken.mockResolvedValueOnce({ token: 'brand-new-access-token' });
    mockCredentials = { expiry_date: Date.now() + 3600_000 };

    mockQuery.mockResolvedValueOnce(queryResult([])); // UPDATE encrypted_access_token

    const { getAuthenticatedClient } = await import('../services/googleCalendarService');
    await getAuthenticatedClient(row);

    const updateCall = mockQuery.mock.calls.find(call => String(call[0]).includes('UPDATE google_calendar_connections'));
    expect(updateCall).toBeDefined();
    const params = updateCall![1] as string[];
    expect(params).not.toContain('brand-new-access-token');
    expect(params.some(p => typeof p === 'string' && p.startsWith('v1.'))).toBe(true);
  });

  it('does not write to the database when the token did not actually change', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const row = connectionRow({
      encryptedAccessToken: encryptToken('same-access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
    });

    mockGetAccessToken.mockResolvedValueOnce({ token: 'same-access-token' });

    const { getAuthenticatedClient } = await import('../services/googleCalendarService');
    await getAuthenticatedClient(row);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('on invalid_grant (revoked access), records the reconnect sentinel and throws it, never the raw Google error', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const row = connectionRow({
      encryptedAccessToken: encryptToken('old-access-token'),
      encryptedRefreshToken: encryptToken('revoked-refresh-token'),
    });

    mockGetAccessToken.mockRejectedValueOnce(new Error('invalid_grant: Token has been expired or revoked.'));
    mockQuery.mockResolvedValueOnce(queryResult([])); // UPDATE last_sync_error

    const { getAuthenticatedClient, RECONNECT_REQUIRED_SENTINEL } = await import('../services/googleCalendarService');
    await expect(getAuthenticatedClient(row)).rejects.toThrow(RECONNECT_REQUIRED_SENTINEL);

    const updateCall = mockQuery.mock.calls.find(call => String(call[0]).includes('last_sync_error'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(RECONNECT_REQUIRED_SENTINEL);
  });

  it('propagates a non-invalid_grant error unchanged (transient failure, not a reconnect condition)', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const row = connectionRow({
      encryptedAccessToken: encryptToken('old-access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
    });

    mockGetAccessToken.mockRejectedValueOnce(new Error('network timeout'));

    const { getAuthenticatedClient } = await import('../services/googleCalendarService');
    await expect(getAuthenticatedClient(row)).rejects.toThrow('network timeout');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('googleCalendarService.ts - disconnect', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    resetMockQuery();
    setValidGoogleEnv();
    mockCalendarsDelete.mockReset();
    mockGetAccessToken.mockReset();
    mockCredentials = {};
  });

  afterEach(() => {
    resetEnv();
  });

  it('is a no-op when no connection exists (idempotent, not an error)', async () => {
    mockQuery.mockResolvedValueOnce(queryResult([]));
    const { disconnect } = await import('../services/googleCalendarService');
    await expect(disconnect(INSTRUCTOR_ID, TENANT_ID)).resolves.toBeUndefined();
    expect(mockCalendarsDelete).not.toHaveBeenCalled();
  });

  it('deletes the local connection row even when the Google-side calendar delete fails', async () => {
    const { encryptToken } = await import('../utils/encryption');
    mockQuery.mockResolvedValueOnce(queryResult([{
      id: 'row-1',
      tenant_id: TENANT_ID,
      instructor_id: INSTRUCTOR_ID,
      google_calendar_id: 'cal-1',
      encrypted_access_token: encryptToken('at'),
      encrypted_refresh_token: encryptToken('rt'),
      access_token_expires_at: new Date(),
      last_sync_at: null,
      last_sync_error: null,
      connected_at: new Date(),
      updated_at: new Date(),
    }]));
    mockGetAccessToken.mockResolvedValueOnce({ token: 'at' });
    mockCalendarsDelete.mockRejectedValueOnce(new Error('Google API unavailable'));
    mockQuery.mockResolvedValueOnce(queryResult([])); // DELETE

    const { disconnect } = await import('../services/googleCalendarService');
    await expect(disconnect(INSTRUCTOR_ID, TENANT_ID)).resolves.toBeUndefined();

    const deleteCall = mockQuery.mock.calls.find(call => String(call[0]).includes('DELETE FROM google_calendar_connections'));
    expect(deleteCall).toBeDefined();
  });
});

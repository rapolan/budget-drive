import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression-shaped coverage for the first reversible-encryption primitive
// in this codebase (backend/src/utils/encryption.ts), built for storing
// Google Calendar OAuth tokens at rest. Mirrors
// walletKeyStartupSafety.test.ts's exact structure: a required secret
// missing (or here, additionally wrong-length) must fail loudly at
// startup (config/env.ts, before any route binds) and again defensively
// inside the module itself - never a silent fallback - and the key/
// plaintext must never be logged.

const ORIGINAL_ENV = { ...process.env };
const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes hex-encoded

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe('config/env.ts - Google Calendar sync startup safety', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  afterEach(() => {
    resetEnv();
    vi.resetModules();
  });

  it('throws when GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_CLIENT_SECRET is not', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    await expect(import('../config/env')).rejects.toThrow(
      /GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_CLIENT_SECRET is not configured/
    );
  });

  it('throws when GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_REDIRECT_URI is not', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;

    await expect(import('../config/env')).rejects.toThrow(
      /GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_REDIRECT_URI is not configured/
    );
  });

  it('throws when GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_STATE_SECRET is not', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;

    await expect(import('../config/env')).rejects.toThrow(
      /GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_STATE_SECRET is not configured/
    );
  });

  it('throws when GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'state-secret';
    delete process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;

    await expect(import('../config/env')).rejects.toThrow(
      /GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured/
    );
  });

  it('throws when GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is set but the wrong length', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'state-secret';
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'tooshort';

    await expect(import('../config/env')).rejects.toThrow(
      /must decode to exactly 32 bytes/
    );
  });

  it('does not throw when every Google Calendar sync variable is correctly configured', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
    process.env.GOOGLE_OAUTH_STATE_SECRET = 'state-secret';
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;

    const { config } = await import('../config/env');
    expect(config.GOOGLE_OAUTH_CLIENT_ID).toBe('client-id');
  });

  it('Google Calendar sync being unconfigured entirely is completely unaffected (a fresh clone with no Google env vars at all)', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    delete process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;

    const { config } = await import('../config/env');
    expect(config.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
  });
});

describe('encryption.ts - getEncryptionKey', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  afterEach(() => {
    resetEnv();
  });

  it('throws when GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured', async () => {
    delete process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
    const { getEncryptionKey } = await import('../utils/encryption');
    expect(() => getEncryptionKey()).toThrow(/GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured/);
  });

  it('throws when the configured key is not exactly 32 bytes once hex-decoded', async () => {
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = 'ab'; // 1 byte
    const { getEncryptionKey } = await import('../utils/encryption');
    expect(() => getEncryptionKey()).toThrow(/must decode to exactly 32 bytes/);
  });

  it('succeeds and returns a 32-byte buffer when the key is correctly configured', async () => {
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
    const { getEncryptionKey } = await import('../utils/encryption');
    const key = getEncryptionKey();
    expect(key.length).toBe(32);
  });
});

describe('encryption.ts - encryptToken/decryptToken round trip', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
  });

  afterEach(() => {
    resetEnv();
  });

  it('decrypts back to the exact original plaintext', async () => {
    const { encryptToken, decryptToken } = await import('../utils/encryption');
    const plaintext = 'ya29.a0AfH6SMBreal-looking-google-access-token-value';
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it('the stored ciphertext is version-prefixed with "v1."', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const encrypted = encryptToken('some-refresh-token');
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted.split('.')).toHaveLength(4);
  });

  it('never produces ciphertext that contains the plaintext token value', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const plaintext = 'a-very-distinctive-plaintext-refresh-token-xyz987';
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });

  it('two encryptions of the same plaintext produce different ciphertext (random IV per call)', async () => {
    const { encryptToken } = await import('../utils/encryption');
    const a = encryptToken('same-plaintext-value');
    const b = encryptToken('same-plaintext-value');
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext instead of returning corrupted plaintext', async () => {
    const { encryptToken, decryptToken } = await import('../utils/encryption');
    const encrypted = encryptToken('some-access-token');
    const parts = encrypted.split('.');
    // Flip the ciphertext segment (last part) to simulate tampering/corruption.
    parts[3] = Buffer.from('tampered-bytes-here-not-matching-auth-tag').toString('base64');
    const tampered = parts.join('.');

    expect(() => decryptToken(tampered)).toThrow();
  });

  it('rejects a value with an unrecognized version prefix', async () => {
    const { decryptToken } = await import('../utils/encryption');
    expect(() => decryptToken('v2.abc.def.ghi')).toThrow(/Unrecognized encrypted token format/);
  });
});

describe('encryption.ts - never logs a token or the encryption key', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    resetEnv();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('encrypting and decrypting a token produces zero console output', async () => {
    const { encryptToken, decryptToken } = await import('../utils/encryption');
    const plaintext = 'a-real-looking-oauth-token-value-12345';
    const encrypted = encryptToken(plaintext);
    decryptToken(encrypted);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('a thrown error message never contains the actual configured key value', async () => {
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
    vi.resetModules();
    const { decryptToken } = await import('../utils/encryption');

    try {
      decryptToken('v1.not-valid-base64-iv.x.y');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(VALID_KEY_HEX);
    }
  });
});

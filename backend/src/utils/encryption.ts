/**
 * Reversible encryption at rest for Google Calendar OAuth tokens.
 *
 * The first symmetric-encryption primitive in this codebase - every other
 * crypto.* usage here (userService.ts's invite-token hashing, the archive
 * integrity hash) is one-way hashing, correct for values only ever
 * verified-by-recompute, never for values the app must get back in
 * plaintext. Google OAuth access/refresh tokens are the opposite
 * requirement: the exact original value must be recoverable to present
 * in an Authorization header to Google's API, so hashing is structurally
 * unusable here - this module exists because nothing before this feature
 * needed a real encrypt/decrypt round trip.
 *
 * AES-256-GCM (authenticated encryption - the auth tag detects tampering,
 * not just confidentiality) via Node's built-in crypto.createCipheriv/
 * createDecipheriv. Same two-boundary startup-safety pattern already
 * applied to the BSV wallet key (docs/ARCHITECTURE.md §23): a required
 * key that's missing must fail loudly at the earliest possible point
 * (config/env.ts, before any route binds) and again defensively here if
 * this module is ever reached without it - never a silent fallback, and
 * the key/plaintext token are never logged anywhere.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const CIPHERTEXT_VERSION = 'v1';

/**
 * Decodes and validates GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY. Throws
 * (never falls back to a derived/default key) if it's missing or isn't
 * exactly 32 bytes once hex-decoded - AES-256-GCM requires precisely a
 * 256-bit key, and a wrong-length key must fail here, not produce silently
 * broken ciphertext the first time a token is actually encrypted.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured. ' +
      'Set this environment variable before connecting any instructor\'s Google Calendar - ' +
      'generate one with `openssl rand -hex 32`.'
    );
  }

  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes ` +
      `(got ${key.length}) - it must be a 32-byte value in hex, e.g. via \`openssl rand -hex 32\`.`
    );
  }

  return key;
}

/**
 * Encrypts a plaintext token for storage. Output is version-prefixed
 * (`v1.<iv>.<authTag>.<ciphertext>`, each segment base64) rather than just
 * the three raw components, so a future key rotation or algorithm change
 * can recognize and migrate v1 values explicitly instead of guessing a
 * stored value's format from its shape.
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    CIPHERTEXT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

/**
 * Decrypts a value previously produced by encryptToken. Throws on an
 * unrecognized version prefix or a failed auth-tag check (tampered or
 * corrupted ciphertext) rather than returning garbage plaintext.
 */
export function decryptToken(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== CIPHERTEXT_VERSION) {
    throw new Error(`Unrecognized encrypted token format (expected "${CIPHERTEXT_VERSION}.<iv>.<authTag>.<ciphertext>")`);
  }
  const [, ivB64, authTagB64, dataB64] = parts;

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

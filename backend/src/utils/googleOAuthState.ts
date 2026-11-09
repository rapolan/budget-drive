/**
 * Signs/verifies the OAuth `state` parameter carried through the Google
 * consent redirect round-trip. Reuses the jsonwebtoken library already a
 * dependency of this app (same shape as utils/jwt.ts's own
 * generate/verifyToken), but with its OWN signing key
 * (GOOGLE_OAUTH_STATE_SECRET, never JWT_SECRET) and a short, fixed
 * expiry - an OAuth consent round-trip is normally seconds, so ~10
 * minutes is generous headroom for a slow human without leaving a
 * long-lived, replayable value sitting in browser history/redirect logs.
 * Using a distinct signing key keeps this value cryptographically
 * unrelated to a real login JWT: a leaked `state` can never be mistaken
 * for, or abused as, a session token, and vice versa.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface GoogleOAuthStatePayload {
  instructorId: string;
  tenantId: string;
}

const STATE_EXPIRY = '10m';

function getStateSecret(): string {
  const secret = config.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error(
      'GOOGLE_OAUTH_STATE_SECRET is not configured. ' +
      'Set this environment variable before starting a Google Calendar OAuth connect flow.'
    );
  }
  return secret;
}

export function signOAuthState(payload: GoogleOAuthStatePayload): string {
  return jwt.sign(payload, getStateSecret(), { expiresIn: STATE_EXPIRY });
}

/**
 * Verifies and decodes a signed `state` value. Throws (never returns a
 * partially-trusted result) on an invalid signature, an expired value, or
 * malformed JSON - the callback route must treat any of these identically
 * as "reject the callback," never attempt to proceed with a best-guess.
 */
export function verifyOAuthState(state: string): GoogleOAuthStatePayload {
  const decoded = jwt.verify(state, getStateSecret()) as jwt.JwtPayload & GoogleOAuthStatePayload;
  if (!decoded.instructorId || !decoded.tenantId) {
    throw new Error('Malformed OAuth state payload');
  }
  return { instructorId: decoded.instructorId, tenantId: decoded.tenantId };
}

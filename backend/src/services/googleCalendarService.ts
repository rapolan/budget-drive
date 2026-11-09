/**
 * Google Calendar Sync Service
 *
 * Connection management (connect/callback/disconnect/status/token
 * refresh) for an instructor's own, dedicated "Driving Lessons" Google
 * Calendar - additive alongside the existing ICS feed
 * (calendarFeedService.ts), which stays completely unchanged as the
 * zero-setup fallback. Lesson-event sync (create/update/cancel events,
 * backfill, resync) is a separate module built in a later commit of this
 * same feature.
 *
 * Scope: https://www.googleapis.com/auth/calendar.app.created - the
 * narrowest scope Google offers for this use case. It can only create
 * secondary calendars and manage events on calendars it created itself;
 * it structurally cannot read or write the instructor's primary calendar
 * or any other calendar they own.
 */

import { OAuth2Client } from 'google-auth-library';
import { calendar as googleCalendar } from '@googleapis/calendar';
import { query } from '../config/database';
import { config } from '../config/env';
import { keysToCamel } from '../utils/caseConversion';
import { encryptToken, decryptToken } from '../utils/encryption';
import { signOAuthState, verifyOAuthState } from '../utils/googleOAuthState';
import { getTenantSettings } from './tenantService';
import { createLogger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const logger = createLogger('GoogleCalendarService');

export const CALENDAR_APP_CREATED_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

// A reconnect-required state is recorded as this exact sentinel (never the
// raw Google error text) so the frontend can reliably detect it and show
// a "reconnect your Google Calendar" action, distinct from a generic/
// transient sync failure.
export const RECONNECT_REQUIRED_SENTINEL = 'reconnect_required';

// Every outbound Google API call carries this timeout, so a hanging
// connection can never tie up the Node process indefinitely - it fails
// fast into the same catch-and-log path as any other sync error.
export const GOOGLE_API_TIMEOUT_MS = 10_000;

export interface GoogleCalendarConnectionRow {
  id: string;
  tenantId: string;
  instructorId: string;
  googleCalendarId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  accessTokenExpiresAt: Date;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  connectedAt: Date;
  updatedAt: Date;
}

function getOAuthConfig() {
  const clientId = config.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = config.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = config.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError('Google Calendar sync is not configured for this environment', 503);
  }
  return { clientId, clientSecret, redirectUri };
}

function createOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export async function getConnectionRow(instructorId: string, tenantId: string): Promise<GoogleCalendarConnectionRow | null> {
  const result = await query(
    `SELECT * FROM google_calendar_connections WHERE instructor_id = $1 AND tenant_id = $2`,
    [instructorId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return keysToCamel(result.rows[0]) as GoogleCalendarConnectionRow;
}

/**
 * Builds the Google consent URL an instructor is redirected to. Caller
 * (the route) is responsible for enforcing that only the instructor
 * themselves can reach this - see the route-level guard, deliberately
 * NOT the same isOwnFeedOrElevated helper the ICS feed's status/setup
 * routes use, since an admin "connecting on an instructor's behalf"
 * would really be binding their OWN Google account to that instructor's
 * record, a correctness problem, not just an access-control one.
 */
export function buildConsentUrl(instructorId: string, tenantId: string): string {
  const client = createOAuth2Client();
  const state = signOAuthState({ instructorId, tenantId });

  return client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh token at all
    prompt: 'consent', // forces a fresh refresh token even on a re-connect
    scope: [CALENDAR_APP_CREATED_SCOPE],
    state,
  });
}

/**
 * Handles the Google redirect back to this app: verifies `state`,
 * exchanges the authorization code for tokens, creates the dedicated
 * calendar on a genuinely first connection, and stores everything
 * encrypted. Returns the instructorId/tenantId so the route can redirect
 * the browser onward and (in a later commit) trigger a non-blocking
 * backfill.
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<{ instructorId: string; tenantId: string }> {
  const { instructorId, tenantId } = verifyOAuthState(state);

  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    // Google only issues a refresh_token on a user's first-ever
    // authorization for this app's OAuth client - buildConsentUrl always
    // passes prompt: 'consent' specifically to guarantee a fresh one is
    // issued every time, so a missing refresh_token here means something
    // is wrong with the exchange itself, not an expected "already
    // authorized" state to tolerate silently.
    throw new AppError('Google did not return a complete token set (missing refresh token)', 502);
  }

  client.setCredentials(tokens);

  const existing = await getConnectionRow(instructorId, tenantId);

  let googleCalendarId: string;
  if (existing) {
    // Re-connecting (e.g. after a prior disconnect, or re-authorizing) -
    // reuse the same dedicated calendar rather than creating a second one.
    googleCalendarId = existing.googleCalendarId;
  } else {
    const tenantSettings = await getTenantSettings(tenantId);
    const calendarName = `${tenantSettings?.businessName || 'Driving School'} - Driving Lessons`;

    const cal = googleCalendar({ version: 'v3', auth: client });
    const created = await cal.calendars.insert(
      { requestBody: { summary: calendarName } },
      { timeout: GOOGLE_API_TIMEOUT_MS }
    );

    if (!created.data.id) {
      throw new AppError('Google did not return an id for the newly created calendar', 502);
    }
    googleCalendarId = created.data.id;
  }

  const encryptedAccessToken = encryptToken(tokens.access_token);
  const encryptedRefreshToken = encryptToken(tokens.refresh_token);
  const accessTokenExpiresAt = new Date(tokens.expiry_date);

  if (existing) {
    await query(
      `UPDATE google_calendar_connections
       SET google_calendar_id = $1, encrypted_access_token = $2, encrypted_refresh_token = $3,
           access_token_expires_at = $4, last_sync_error = NULL, updated_at = NOW()
       WHERE instructor_id = $5 AND tenant_id = $6`,
      [googleCalendarId, encryptedAccessToken, encryptedRefreshToken, accessTokenExpiresAt, instructorId, tenantId]
    );
  } else {
    await query(
      `INSERT INTO google_calendar_connections
         (tenant_id, instructor_id, google_calendar_id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, instructorId, googleCalendarId, encryptedAccessToken, encryptedRefreshToken, accessTokenExpiresAt]
    );
  }

  logger.info('Google Calendar connected', { tenantId, instructorId, isReconnect: Boolean(existing) });

  return { instructorId, tenantId };
}

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  reconnectRequired: boolean;
}

export async function getStatus(instructorId: string, tenantId: string): Promise<GoogleCalendarStatus> {
  const row = await getConnectionRow(instructorId, tenantId);
  if (!row) {
    return { connected: false, lastSyncAt: null, lastSyncError: null, reconnectRequired: false };
  }
  return {
    connected: true,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastSyncError: row.lastSyncError,
    reconnectRequired: row.lastSyncError === RECONNECT_REQUIRED_SENTINEL,
  };
}

/**
 * Returns an OAuth2Client with valid (refreshed if necessary) credentials
 * for the given connection row, persisting a refreshed access token back
 * to the database before returning. Throws with the RECONNECT_REQUIRED_SENTINEL
 * message when the refresh token itself has been invalidated (the
 * instructor revoked access, or Google invalidated it) - callers must
 * catch this specifically and record the sentinel, never surface the raw
 * Google error.
 */
export async function getAuthenticatedClient(row: GoogleCalendarConnectionRow): Promise<OAuth2Client> {
  const client = createOAuth2Client();
  const accessToken = decryptToken(row.encryptedAccessToken);
  const refreshToken = decryptToken(row.encryptedRefreshToken);

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: row.accessTokenExpiresAt.getTime(),
  });

  // getAccessToken() refreshes internally if the current token is expired
  // or about to expire - this is the on-demand, immediately-before-each-
  // write refresh model (no background job): a lesson write already has
  // to touch this table, so there's no benefit to a separate scheduled
  // refresh process, and it avoids "the background job didn't run in
  // time" staleness entirely.
  let refreshedToken: string | null;
  try {
    const result = await client.getAccessToken();
    refreshedToken = result.token ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('invalid_grant')) {
      await query(
        `UPDATE google_calendar_connections SET last_sync_error = $1, updated_at = NOW()
         WHERE instructor_id = $2 AND tenant_id = $3`,
        [RECONNECT_REQUIRED_SENTINEL, row.instructorId, row.tenantId]
      );
      throw new Error(RECONNECT_REQUIRED_SENTINEL);
    }
    throw error;
  }

  // Persist a refreshed token if the client actually rotated one - the
  // comparison against the decrypted original avoids a redundant write
  // (and redundant re-encryption) on the common case where the existing
  // access token was still valid and nothing changed.
  if (refreshedToken && refreshedToken !== accessToken) {
    const credentials = client.credentials;
    const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : row.accessTokenExpiresAt;
    await query(
      `UPDATE google_calendar_connections
       SET encrypted_access_token = $1, access_token_expires_at = $2, updated_at = NOW()
       WHERE instructor_id = $3 AND tenant_id = $4`,
      [encryptToken(refreshedToken), newExpiry, row.instructorId, row.tenantId]
    );
  }

  return client;
}

/**
 * Disconnects an instructor's Google Calendar: deletes the dedicated
 * calendar from their real Google account (it was created by this app
 * for this purpose and holds nothing the instructor authored themselves,
 * per the one-directional design - leaving it behind empty/stale is a
 * worse outcome than removing it), then removes the local connection
 * row regardless of whether the Google-side delete succeeded. A failed
 * Google delete (already-revoked access, a transient API error) must
 * never block the instructor from disconnecting on this app's side.
 */
export async function disconnect(instructorId: string, tenantId: string): Promise<void> {
  const row = await getConnectionRow(instructorId, tenantId);
  if (!row) {
    return; // already disconnected - idempotent, not an error
  }

  try {
    const client = await getAuthenticatedClient(row);
    const cal = googleCalendar({ version: 'v3', auth: client });
    await cal.calendars.delete(
      { calendarId: row.googleCalendarId },
      { timeout: GOOGLE_API_TIMEOUT_MS }
    );
  } catch (error) {
    logger.warn('Failed to delete dedicated Google Calendar on disconnect (non-blocking)', {
      tenantId,
      instructorId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Proceed to remove the local row regardless - see function doc above.
  }

  await query(
    `DELETE FROM google_calendar_connections WHERE instructor_id = $1 AND tenant_id = $2`,
    [instructorId, tenantId]
  );

  logger.info('Google Calendar disconnected', { tenantId, instructorId });
}

export default {
  CALENDAR_APP_CREATED_SCOPE,
  RECONNECT_REQUIRED_SENTINEL,
  GOOGLE_API_TIMEOUT_MS,
  buildConsentUrl,
  handleOAuthCallback,
  getStatus,
  getConnectionRow,
  getAuthenticatedClient,
  disconnect,
};

/**
 * Google Calendar OAuth 2.0 Authentication Service
 * Handles OAuth flow and token management
 */

import { google } from 'googleapis';
import { pool } from '../config/database';
import { CalendarOAuthTokens, CreateCalendarCredentialsDTO } from '../types';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export class GoogleCalendarAuthService {
  private oauth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(instructorId: string): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: instructorId, // Pass instructor ID as state
      prompt: 'consent', // Force consent to get refresh token
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string): Promise<CalendarOAuthTokens> {
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain tokens from authorization code');
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || SCOPES.join(' '),
    };
  }

  /**
   * Store credentials in database
   */
  async storeCredentials(
    tenantId: string,
    instructorId: string,
    tokens: CalendarOAuthTokens,
    calendarId: string = 'primary'
  ): Promise<void> {
    const query = `
      INSERT INTO instructor_calendar_credentials (
        tenant_id, instructor_id, google_access_token, google_refresh_token,
        google_token_expiry, google_calendar_id, sync_enabled, sync_direction,
        auto_sync, sync_interval_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, true, 'two_way', true, 15)
      ON CONFLICT (tenant_id, instructor_id)
      DO UPDATE SET
        google_access_token = $3,
        google_refresh_token = $4,
        google_token_expiry = $5,
        google_calendar_id = $6,
        sync_enabled = true,
        updated_at = CURRENT_TIMESTAMP
    `;

    await pool.query(query, [
      tenantId,
      instructorId,
      tokens.access_token,
      tokens.refresh_token,
      new Date(tokens.expiry_date),
      calendarId,
    ]);

    // Update instructor table
    await pool.query(
      'UPDATE instructors SET calendar_sync_enabled = true WHERE id = $1',
      [instructorId]
    );
  }

  /**
   * Get credentials from database
   */
  async getCredentials(instructorId: string): Promise<any> {
    const result = await pool.query(
      'SELECT * FROM instructor_calendar_credentials WHERE instructor_id = $1 AND sync_enabled = true',
      [instructorId]
    );

    return result.rows[0] || null;
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(instructorId: string): Promise<string> {
    const credentials = await this.getCredentials(instructorId);

    if (!credentials) {
      throw new Error('No credentials found for instructor');
    }

    // Check if token is expired
    const now = new Date();
    const expiry = new Date(credentials.google_token_expiry);

    if (expiry > now) {
      return credentials.google_access_token; // Token still valid
    }

    // Refresh token
    this.oauth2Client.setCredentials({
      refresh_token: credentials.google_refresh_token,
    });

    const { credentials: newCredentials } = await this.oauth2Client.refreshAccessToken();

    if (!newCredentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    // Update database
    await pool.query(
      `UPDATE instructor_calendar_credentials
       SET google_access_token = $1, google_token_expiry = $2, updated_at = CURRENT_TIMESTAMP
       WHERE instructor_id = $3`,
      [newCredentials.access_token, new Date(newCredentials.expiry_date!), instructorId]
    );

    return newCredentials.access_token;
  }

  /**
   * Get authenticated calendar client
   */
  async getCalendarClient(instructorId: string) {
    const accessToken = await this.refreshAccessToken(instructorId);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Disconnect calendar (disable sync)
   */
  async disconnect(instructorId: string): Promise<void> {
    await pool.query(
      `UPDATE instructor_calendar_credentials
       SET sync_enabled = false, updated_at = CURRENT_TIMESTAMP
       WHERE instructor_id = $1`,
      [instructorId]
    );

    await pool.query(
      'UPDATE instructors SET calendar_sync_enabled = false WHERE id = $1',
      [instructorId]
    );
  }

  /**
   * Get sync status
   */
  async getSyncStatus(instructorId: string): Promise<any> {
    const credentials = await this.getCredentials(instructorId);

    if (!credentials) {
      return {
        connected: false,
        syncEnabled: false,
      };
    }

    return {
      connected: true,
      syncEnabled: credentials.sync_enabled,
      syncDirection: credentials.sync_direction,
      lastSyncAt: credentials.last_sync_at,
      lastSyncStatus: credentials.last_sync_status,
      calendarId: credentials.google_calendar_id,
    };
  }
}

export const googleCalendarAuthService = new GoogleCalendarAuthService();

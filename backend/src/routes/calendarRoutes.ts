/**
 * Google Calendar API Routes
 */

import express from 'express';
import { googleCalendarAuthService } from '../services/googleCalendarAuth';
import { googleCalendarSyncService } from '../services/googleCalendarSync';
import { authenticate } from '../middleware/authenticate';
import { requireTenantContext } from '../middleware/requireTenantContext';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /api/v1/calendar/oauth/url
 * Generate OAuth authorization URL
 */
router.get('/oauth/url', async (req, res) => {
  try {
    const { instructorId } = req.query;

    if (!instructorId) {
      return res.status(400).json({ success: false, error: 'Instructor ID required' });
    }

    const authUrl = googleCalendarAuthService.generateAuthUrl(instructorId as string);

    res.json({
      success: true,
      data: { authUrl, instructorId },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/calendar/oauth/callback
 * Handle OAuth callback
 */
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({ success: false, error: 'Missing code or state' });
    }

    const instructorId = state as string;
    const tenantId = (req as any).tenantId;

    // Exchange code for tokens
    const tokens = await googleCalendarAuthService.getTokensFromCode(code as string);

    // Store credentials
    await googleCalendarAuthService.storeCredentials(tenantId, instructorId, tokens);

    // Redirect to frontend success page
    res.redirect(`http://localhost:5173/scheduling?calendar=connected`);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.redirect(`http://localhost:5173/scheduling?calendar=error`);
  }
});

/**
 * POST /api/v1/calendar/sync
 * Trigger manual sync
 */
router.post('/sync', async (req, res) => {
  try {
    const { instructorId } = req.body;
    const tenantId = (req as any).tenantId;

    if (!instructorId) {
      return res.status(400).json({ success: false, error: 'Instructor ID required' });
    }

    const result = await googleCalendarSyncService.performFullSync(instructorId, tenantId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/calendar/status/:instructorId
 * Get sync status
 */
router.get('/status/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;

    const status = await googleCalendarAuthService.getSyncStatus(instructorId);

    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/calendar/disconnect
 * Disconnect calendar
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { instructorId } = req.body;

    if (!instructorId) {
      return res.status(400).json({ success: false, error: 'Instructor ID required' });
    }

    await googleCalendarAuthService.disconnect(instructorId);

    res.json({ success: true, message: 'Calendar disconnected' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/calendar/external-events/:instructorId
 * Get external calendar events
 */
router.get('/external-events/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    const { rows } = await require('../config/database').pool.query(
      `SELECT * FROM external_calendar_events
       WHERE instructor_id = $1 AND tenant_id = $2
       AND event_start >= CURRENT_TIMESTAMP
       AND is_deleted = false
       ORDER BY event_start ASC`,
      [instructorId, tenantId]
    );

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

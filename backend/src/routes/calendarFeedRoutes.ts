/**
 * Calendar Feed Routes
 * Authenticated management endpoints for instructor calendar feeds.
 *
 * NOTE: The public /:token.ics download endpoint is registered directly
 *       on the Express app in app.ts to avoid auth middleware conflicts.
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import calendarFeedService from '../services/calendarFeedService';

const router = express.Router();

// All routes in this file require a valid JWT + tenant context
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /feed/status/:instructorId
 * Get the calendar feed status for an instructor
 */
router.get('/feed/status/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    const token = await calendarFeedService.getFeedToken(instructorId, tenantId);

    if (token) {
      const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const feedUrl = `${baseUrl}/api/v1/calendar-feed/${token}.ics`;
      return res.json({ hasCalendarFeed: true, feedUrl });
    }

    return res.json({ hasCalendarFeed: false, feedUrl: null });
  } catch (error: any) {
    console.error('Error getting calendar feed status:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /feed/setup/:instructorId
 * Setup/create a calendar feed for an instructor
 */
router.post('/feed/setup/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;
    const regenerate = req.query.regenerate === 'true';

    let token: string;
    if (regenerate) {
      token = await calendarFeedService.regenerateFeedToken(instructorId, tenantId);
    } else {
      token = await calendarFeedService.getOrCreateFeedToken(instructorId, tenantId);
    }

    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const feedUrl = `${baseUrl}/api/v1/calendar-feed/${token}.ics`;

    return res.json({ feedUrl });
  } catch (error: any) {
    console.error('Error setting up calendar feed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /url/:instructorId
 * Get the calendar feed URL for an instructor (legacy — use feed/status instead)
 */
router.get('/url/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    const token = await calendarFeedService.getOrCreateFeedToken(instructorId, tenantId);
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const feedUrl = `${baseUrl}/api/v1/calendar-feed/${token}.ics`;

    return res.json({
      success: true,
      data: {
        feedUrl,
        instructions: {
          google: 'Open Google Calendar → Settings → Add calendar → From URL → Paste the feed URL',
          apple: 'Open Calendar app → File → New Calendar Subscription → Paste the feed URL',
          outlook: 'Open Outlook → Add Calendar → Subscribe from web → Paste the feed URL',
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting calendar feed URL:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /regenerate/:instructorId
 * Regenerate the feed token (invalidates old subscriptions)
 */
router.post('/regenerate/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    const token = await calendarFeedService.regenerateFeedToken(instructorId, tenantId);
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const feedUrl = `${baseUrl}/api/v1/calendar-feed/${token}.ics`;

    return res.json({
      success: true,
      data: {
        feedUrl,
        message: 'Feed URL regenerated. Old subscriptions will no longer work.',
      },
    });
  } catch (error: any) {
    console.error('Error regenerating calendar feed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

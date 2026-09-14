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
 * Derives this server's own public base URL from the incoming request
 * itself (req.protocol + req.get('host')) rather than a manually-set
 * env var like API_BASE_URL - that var was never actually set in
 * production, so it silently fell back to `http://localhost:${PORT}`,
 * producing a feed URL no real instructor could ever subscribe to. This
 * is self-correcting in any environment (dev, staging, production) with
 * zero configuration, the same fix already applied to the invite-link's
 * FRONTEND_URL fragility.
 *
 * req.protocol reflects 'https' correctly behind Railway's TLS-terminating
 * reverse proxy only because Express's `trust proxy` setting is enabled
 * in app.ts - without it, Express reports the protocol of its own
 * plaintext connection to the proxy (http), not what the original client
 * actually used.
 */
const getBaseUrl = (req: express.Request): string => `${req.protocol}://${req.get('host')}`;

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
      const feedUrl = `${getBaseUrl(req)}/api/v1/calendar-feed/${token}.ics`;
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

    const feedUrl = `${getBaseUrl(req)}/api/v1/calendar-feed/${token}.ics`;

    return res.json({ feedUrl });
  } catch (error: any) {
    console.error('Error setting up calendar feed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

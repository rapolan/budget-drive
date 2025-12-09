/**
 * Calendar Feed Routes
 * Provides ICS/iCal calendar feeds for instructors
 * 
 * These feeds work with any calendar app:
 * - Google Calendar
 * - Apple Calendar  
 * - Microsoft Outlook
 * - Any iCal-compatible app
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import calendarFeedService from '../services/calendarFeedService';

const router = express.Router();

/**
 * GET /api/v1/calendar-feed/:token.ics
 * Public endpoint - returns ICS feed for the instructor
 * No authentication required (token IS the authentication)
 */
router.get('/:token.ics', async (req, res) => {
  try {
    const { token } = req.params;

    // Look up instructor by token
    const instructor = await calendarFeedService.getInstructorByFeedToken(token);

    if (!instructor) {
      return res.status(404).send('Calendar feed not found');
    }

    // Generate ICS content
    const icsContent = await calendarFeedService.generateICSFeed(
      instructor.id,
      instructor.tenantId
    );

    // Set headers for ICS file
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${instructor.fullName.replace(/[^a-zA-Z0-9]/g, '_')}_lessons.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    return res.send(icsContent);
  } catch (error: any) {
    console.error('Error generating calendar feed:', error);
    return res.status(500).send('Error generating calendar feed');
  }
});

// ============================================
// Authenticated endpoints for managing feeds
// ============================================

// Apply auth middleware
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /api/v1/calendar-feed/feed/status/:instructorId
 * Get the calendar feed status for an instructor
 */
router.get('/feed/status/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    // Check if instructor has a feed token
    const token = await calendarFeedService.getFeedToken(instructorId, tenantId);

    if (token) {
      const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const feedUrl = `${baseUrl}/api/v1/calendar-feed/${token}.ics`;
      return res.json({
        hasCalendarFeed: true,
        feedUrl,
      });
    }

    return res.json({
      hasCalendarFeed: false,
      feedUrl: null,
    });
  } catch (error: any) {
    console.error('Error getting calendar feed status:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/calendar-feed/feed/setup/:instructorId
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

    return res.json({
      feedUrl,
    });
  } catch (error: any) {
    console.error('Error setting up calendar feed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/calendar-feed/url/:instructorId
 * Get the calendar feed URL for an instructor (legacy)
 */
router.get('/url/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    // Get or create feed token
    const token = await calendarFeedService.getOrCreateFeedToken(instructorId, tenantId);

    // Build the feed URL
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
 * POST /api/v1/calendar-feed/regenerate/:instructorId
 * Regenerate the feed token (invalidates old subscriptions)
 */
router.post('/regenerate/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const tenantId = (req as any).tenantId;

    // Regenerate token
    const token = await calendarFeedService.regenerateFeedToken(instructorId, tenantId);

    // Build the new feed URL
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

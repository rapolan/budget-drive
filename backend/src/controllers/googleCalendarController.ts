/**
 * Google Calendar Sync Controller
 * HTTP handlers for an instructor's Google Calendar connection
 * (connect/callback/status/disconnect). The write-path sync itself
 * (lesson create/update/cancel -> Google event) is hooked directly into
 * lessonService.ts in a later commit, not exposed as its own route.
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getTenantId } from '../middleware/tenantContext';
import * as googleCalendarService from '../services/googleCalendarService';
import { syncAllUpcomingLessonsForInstructor } from '../services/googleCalendarSyncService';
import { createLogger } from '../utils/logger';

const logger = createLogger('GoogleCalendarController');

/**
 * Only the instructor whose own record it is may start a connect flow.
 * The Google consent screen authenticates whichever Google account is
 * logged into the browser that opens it, so an admin "connecting on an
 * instructor's behalf" would really bind their OWN Google account to
 * that instructor's record - a correctness problem (the wrong Google
 * account gets permanently tied to the instructor), not just an
 * access-control one. Deliberately NOT the same isOwnFeedOrElevated
 * check calendarFeedRoutes.ts uses for its status/setup routes, which
 * allows elevated roles - this one never does.
 */
const isInstructorSelf = (req: Request, instructorId: string): boolean =>
  req.user?.role === 'instructor' && req.user?.instructorId === instructorId;

/**
 * Status/disconnect allow elevated roles too, same as the ICS feed's
 * own management routes - these are read/revoke actions on existing
 * data, not an action that creates a new human-identity binding.
 */
const isOwnConnectionOrElevated = (req: Request, instructorId: string): boolean =>
  req.user?.role !== 'instructor' || req.user?.instructorId === instructorId;

/**
 * @route   GET /api/v1/google-calendar/connect/:instructorId
 * @desc    Start the OAuth consent flow for an instructor's own Google Calendar
 * @access  Private (instructor-self only)
 */
export const connect = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  if (!isInstructorSelf(req, instructorId)) {
    throw new AppError('Only the instructor themselves can connect their own Google Calendar', 403);
  }

  const consentUrl = googleCalendarService.buildConsentUrl(instructorId, tenantId);

  res.json({
    success: true,
    data: { consentUrl },
  });
});

/**
 * @route   GET /api/v1/google-calendar/status/:instructorId
 * @desc    Get the Google Calendar connection status for an instructor
 * @access  Private (own record or elevated role)
 */
export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  if (!isOwnConnectionOrElevated(req, instructorId)) {
    throw new AppError('Access denied: you can only view your own Google Calendar connection', 403);
  }

  const status = await googleCalendarService.getStatus(instructorId, tenantId);

  res.json({
    success: true,
    data: status,
  });
});

/**
 * @route   POST /api/v1/google-calendar/disconnect/:instructorId
 * @desc    Disconnect an instructor's Google Calendar and delete the dedicated calendar
 * @access  Private (own record or elevated role)
 */
export const disconnect = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  if (!isOwnConnectionOrElevated(req, instructorId)) {
    throw new AppError('Access denied: you can only disconnect your own Google Calendar', 403);
  }

  await googleCalendarService.disconnect(instructorId, tenantId);

  res.json({
    success: true,
    data: null,
    message: 'Google Calendar disconnected',
  });
});

/**
 * @route   GET /api/v1/google-calendar/oauth-callback
 * @desc    Google's redirect target after the instructor grants/denies consent.
 *          Registered directly on app.ts with no authenticate middleware -
 *          Google redirects the bare browser here with no Authorization
 *          header, the same exception already made for the public ICS
 *          feed download route.
 * @access  Public (state param carries and verifies the instructor/tenant identity)
 */
export const oauthCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error: googleError } = req.query;

  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (googleError) {
    logger.info('Google OAuth consent denied or errored', { googleError });
    res.redirect(`${frontendBase}/profile?googleCalendar=denied`);
    return;
  }

  if (typeof code !== 'string' || typeof state !== 'string') {
    throw new AppError('Missing code or state in Google OAuth callback', 400);
  }

  let connectResult: { instructorId: string; tenantId: string };
  try {
    connectResult = await googleCalendarService.handleOAuthCallback(code, state);
  } catch (err) {
    logger.warn('Google OAuth callback failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    res.redirect(`${frontendBase}/profile?googleCalendar=error`);
    return;
  }

  // Backfill every upcoming lesson onto the newly-connected calendar so
  // lessons booked before this connect aren't invisible in it. Fired
  // non-blocking, same fire-and-forget rationale as lessonService.ts's
  // own sync calls - the instructor shouldn't wait on this redirect for
  // however many upcoming lessons they have.
  syncAllUpcomingLessonsForInstructor(connectResult.instructorId, connectResult.tenantId).catch((err) => {
    logger.warn('Backfill after Google Calendar connect failed (non-blocking)', {
      tenantId: connectResult.tenantId,
      instructorId: connectResult.instructorId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  });

  res.redirect(`${frontendBase}/profile?googleCalendar=connected`);
});

/**
 * @route   POST /api/v1/google-calendar/resync/:instructorId
 * @desc    Re-syncs every upcoming lesson for an instructor on demand -
 *          a failed sync for a given lesson is only retried automatically
 *          when that lesson itself changes again, so this is the explicit
 *          "try again" action instead.
 * @access  Private (own record or elevated role)
 */
export const resync = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  if (!isOwnConnectionOrElevated(req, instructorId)) {
    throw new AppError('Access denied: you can only resync your own Google Calendar', 403);
  }

  await syncAllUpcomingLessonsForInstructor(instructorId, tenantId);

  res.json({
    success: true,
    data: null,
    message: 'Resync complete',
  });
});

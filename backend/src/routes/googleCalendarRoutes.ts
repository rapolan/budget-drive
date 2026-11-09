/**
 * Google Calendar Sync Routes
 * Authenticated management endpoints for an instructor's Google Calendar
 * connection.
 *
 * NOTE: The public /oauth-callback endpoint is registered directly on the
 *       Express app in app.ts (no authenticate middleware) - Google
 *       redirects the bare browser there with no Authorization header,
 *       the same exception already made for the public ICS feed download
 *       route.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID } from '../middleware/validate';
import * as googleCalendarController from '../controllers/googleCalendarController';

const router = Router();

// All routes in this file require a valid JWT + tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Start the OAuth consent flow - instructor-self only, enforced in the
// controller (not reusing the elevated-roles-allowed pattern status/
// disconnect use below).
router.get(
  '/google-calendar/connect/:instructorId',
  validateUUID('instructorId'),
  googleCalendarController.connect
);

// Connection status - own record or elevated role.
router.get(
  '/google-calendar/status/:instructorId',
  validateUUID('instructorId'),
  googleCalendarController.getStatus
);

// Disconnect - own record or elevated role.
router.post(
  '/google-calendar/disconnect/:instructorId',
  validateUUID('instructorId'),
  googleCalendarController.disconnect
);

export default router;

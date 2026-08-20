/**
 * Enrollment Routes
 * Flat /enrollments/:id/... - an enrollment id is already tenant-unique,
 * so actions on a specific enrollment don't need to be nested under a
 * student. Listing/creating enrollments FOR a student is nested under
 * /students/:id/enrollments instead (see studentRoutes.ts), matching the
 * existing /students/:id/guardians pattern.
 */

import { Router } from 'express';
import * as enrollmentController from '../controllers/enrollmentController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

// Get a single enrollment with progress and payment summary
router.get(
  '/enrollments/:id',
  validateUUID('id'),
  enrollmentController.getEnrollment
);

// Update an enrollment's program fields
router.patch(
  '/enrollments/:id',
  validateUUID('id'),
  enrollmentController.updateEnrollment
);

// Mark an enrollment's program complete
router.post(
  '/enrollments/:id/complete',
  validateUUID('id'),
  requireRole('owner', 'admin'),
  enrollmentController.completeEnrollment
);

// Reverse an enrollment completion - requires a reason, owner/admin only.
// This is a guarded write (Item 4's reopen UI requires a confirm + reason),
// not a plain undo button.
router.post(
  '/enrollments/:id/reopen',
  validateUUID('id'),
  requireRole('owner', 'admin'),
  validateRequired(['reason']),
  enrollmentController.reopenEnrollment
);

export default router;

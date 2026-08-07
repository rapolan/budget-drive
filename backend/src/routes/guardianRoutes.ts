/**
 * Guardian Routes
 * API routes for guardian management
 */

import { Router } from 'express';
import * as guardianController from '../controllers/guardianController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequiredOneOf } from '../middleware/validate';

const router = Router();

// All guardian routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Get all guardians (paginated)
router.get(
  '/guardians',
  guardianController.getAllGuardians
);

// Find candidate guardians by partial name/email/phone match - registered
// before /guardians/:id so "candidates" and "exact-match" aren't swallowed
// by the :id param route.
router.get(
  '/guardians/candidates',
  guardianController.findCandidates
);

// Exact-match check on email or phone
router.get(
  '/guardians/exact-match',
  guardianController.findExactMatch
);

// Create new guardian
router.post(
  '/guardians',
  validateRequiredOneOf([['email'], ['phone']]),
  guardianController.createGuardian
);

// Get guardian by ID
router.get(
  '/guardians/:id',
  validateUUID('id'),
  guardianController.getGuardian
);

// Update guardian
router.put(
  '/guardians/:id',
  validateUUID('id'),
  guardianController.updateGuardian
);

// Delete guardian (blocked while still linked to any student)
router.delete(
  '/guardians/:id',
  validateUUID('id'),
  guardianController.deleteGuardian
);

// Get students linked to a guardian
router.get(
  '/guardians/:id/students',
  validateUUID('id'),
  guardianController.getStudentsForGuardian
);

export default router;

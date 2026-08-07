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

export default router;

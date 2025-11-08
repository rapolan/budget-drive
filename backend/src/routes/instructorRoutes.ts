/**
 * Instructor Routes
 * API routes for instructor management
 */

import { Router } from 'express';
import * as instructorController from '../controllers/instructorController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

// All instructor routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Get all instructors
router.get(
  '/instructors',
  instructorController.getAllInstructors
);

// Create new instructor
router.post(
  '/instructors',
  validateRequired(['fullName', 'email', 'phone']),
  instructorController.createInstructor
);

// Get instructor by ID
router.get(
  '/instructors/:id',
  validateUUID('id'),
  instructorController.getInstructor
);

// Update instructor
router.put(
  '/instructors/:id',
  validateUUID('id'),
  instructorController.updateInstructor
);

// Delete instructor (soft delete)
router.delete(
  '/instructors/:id',
  validateUUID('id'),
  instructorController.deleteInstructor
);

export default router;

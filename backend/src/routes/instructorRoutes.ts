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

// Get instructor earnings
router.get(
  '/instructors/:id/earnings',
  validateUUID('id'),
  instructorController.getInstructorEarnings
);

// Get the ZIP codes an instructor serves
router.get(
  '/instructors/:id/service-areas',
  validateUUID('id'),
  instructorController.getServiceAreas
);

// Replace the full list of ZIP codes an instructor serves
router.put(
  '/instructors/:id/service-areas',
  validateUUID('id'),
  instructorController.setServiceAreas
);

export default router;

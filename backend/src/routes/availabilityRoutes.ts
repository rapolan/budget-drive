/**
 * Availability Routes
 * RESTful routes for availability and scheduling management
 */

import { Router } from 'express';
import * as availabilityController from '../controllers/availabilityController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateRequired, validateUUID } from '../middleware/validate';

const router = Router();

// Apply authentication and tenant context to all routes
router.use(authenticate);
router.use(requireTenantContext);

// =====================================================
// INSTRUCTOR AVAILABILITY ROUTES
// =====================================================

// Get all instructors' availability
router.get(
  '/availability/all',
  availabilityController.getAllInstructorsAvailability
);

// Get specific instructor's availability
router.get(
  '/availability/instructor/:instructorId',
  validateUUID('instructorId'),
  availabilityController.getInstructorAvailability
);

// Create availability for instructor
router.post(
  '/availability/instructor/:instructorId',
  validateUUID('instructorId'),
  validateRequired(['dayOfWeek', 'startTime', 'endTime']),
  availabilityController.createAvailability
);

// Set complete schedule for instructor (replaces existing)
router.post(
  '/availability/instructor/:instructorId/schedule',
  validateUUID('instructorId'),
  validateRequired(['schedule']),
  availabilityController.setInstructorSchedule
);

// Update availability entry
router.put(
  '/availability/:id',
  validateUUID('id'),
  availabilityController.updateAvailability
);

// Delete availability entry
router.delete(
  '/availability/:id',
  validateUUID('id'),
  availabilityController.deleteAvailability
);

// =====================================================
// TIME OFF ROUTES
// =====================================================

// Get instructor's time off
router.get(
  '/availability/instructor/:instructorId/time-off',
  validateUUID('instructorId'),
  availabilityController.getInstructorTimeOff
);

// Create time off
router.post(
  '/availability/instructor/:instructorId/time-off',
  validateUUID('instructorId'),
  validateRequired(['startDate', 'endDate', 'reason']),
  availabilityController.createTimeOff
);

// Update time off
router.put(
  '/availability/time-off/:id',
  validateUUID('id'),
  availabilityController.updateTimeOff
);

// Delete time off
router.delete(
  '/availability/time-off/:id',
  validateUUID('id'),
  availabilityController.deleteTimeOff
);

// =====================================================
// SCHEDULING SETTINGS ROUTES
// =====================================================

// Get scheduling settings
router.get(
  '/availability/settings',
  availabilityController.getSchedulingSettings
);

// Update scheduling settings
router.put(
  '/availability/settings',
  availabilityController.updateSchedulingSettings
);

// =====================================================
// SMART SCHEDULING ROUTES
// =====================================================

// Find available time slots
router.post(
  '/availability/find-slots',
  validateRequired(['startDate', 'endDate', 'duration']),
  availabilityController.findAvailableSlots
);

// Check for conflicts
router.post(
  '/availability/check-conflicts',
  validateRequired(['instructorId', 'studentId', 'startTime', 'endTime']),
  availabilityController.checkConflicts
);

// Validate booking
router.post(
  '/availability/validate-booking',
  validateRequired(['instructorId', 'studentId', 'startTime', 'endTime']),
  availabilityController.validateBooking
);

export default router;

/**
 * Lesson Routes
 * API routes for lesson/appointment management
 */

import { Router } from 'express';
import * as lessonController from '../controllers/lessonController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

// All lesson routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Get lessons by date range (must be before /:id)
router.get(
  '/lessons/date-range',
  lessonController.getLessonsByDateRange
);

// Get lessons by status (must be before /:id)
router.get(
  '/lessons/status/:status',
  lessonController.getLessonsByStatus
);

// Get lessons by student (must be before /:id)
router.get(
  '/lessons/student/:studentId',
  validateUUID('studentId'),
  lessonController.getLessonsByStudent
);

// Get lessons by instructor (must be before /:id)
router.get(
  '/lessons/instructor/:instructorId',
  validateUUID('instructorId'),
  lessonController.getLessonsByInstructor
);

// Get all lessons (paginated)
router.get(
  '/lessons',
  lessonController.getAllLessons
);

// Create new lesson
router.post(
  '/lessons',
  validateRequired(['studentId', 'instructorId', 'scheduledStart', 'scheduledEnd']),
  lessonController.createLesson
);

// Mark lesson as completed
router.post(
  '/lessons/:id/complete',
  validateUUID('id'),
  lessonController.completeLesson
);

// Get lesson by ID
router.get(
  '/lessons/:id',
  validateUUID('id'),
  lessonController.getLesson
);

// Update lesson
router.put(
  '/lessons/:id',
  validateUUID('id'),
  lessonController.updateLesson
);

// Cancel lesson (soft delete)
router.delete(
  '/lessons/:id',
  validateUUID('id'),
  lessonController.deleteLesson
);

export default router;

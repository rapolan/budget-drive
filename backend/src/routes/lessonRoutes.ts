/**
 * Lesson Routes
 * API routes for lesson/appointment management
 */

import { Router } from 'express';
import * as lessonController from '../controllers/lessonController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired, validateRequiredOneOf } from '../middleware/validate';

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

// A student's most recent lesson - powers "Book again" prefill (must be
// before the more general /lessons/student/:studentId below)
router.get(
  '/lessons/student/:studentId/most-recent',
  validateUUID('studentId'),
  lessonController.getMostRecentLessonByStudent
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

// Create new lesson - accepts either composed scheduledStart/scheduledEnd
// datetimes, or separate date/startTime/endTime fields (lessonService.ts's
// createLesson already supports both shapes)
router.post(
  '/lessons',
  validateRequired(['studentId', 'instructorId']),
  validateRequiredOneOf([
    ['scheduledStart', 'scheduledEnd'],
    ['date', 'startTime', 'endTime'],
  ]),
  lessonController.createLesson
);

// Mark lesson as completed
router.post(
  '/lessons/:id/complete',
  validateUUID('id'),
  lessonController.completeLesson
);

// Mark lesson as no-show
router.post(
  '/lessons/:id/no-show',
  validateUUID('id'),
  lessonController.noShowLesson
);

// Cancel lesson, recording who reviewed it and when - the sole cancellation
// path (replaces the old DELETE /lessons/:id, which had no audit trail and
// no fee-window check).
router.post(
  '/lessons/:id/cancel',
  validateUUID('id'),
  lessonController.cancelLesson
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

export default router;

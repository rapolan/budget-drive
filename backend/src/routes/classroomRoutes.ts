/**
 * Classroom Routes
 * Driver education cohort/session scheduling (Phase 3 of the
 * compliance-records arc).
 */

import { Router } from 'express';
import * as classroomController from '../controllers/classroomController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

router.post(
  '/classroom/cohorts',
  validateRequired(['name', 'capacity', 'sessions']),
  classroomController.createCohort
);
router.get('/classroom/cohorts', classroomController.getCohorts);
router.get('/classroom/cohorts/:id', validateUUID('id'), classroomController.getCohortById);
router.patch('/classroom/cohorts/:id', validateUUID('id'), classroomController.updateCohort);
router.get('/classroom/cohorts/:id/gaps', validateUUID('id'), classroomController.getCohortAttendanceGaps);

export default router;

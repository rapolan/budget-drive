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
router.get('/classroom/cohorts/:id/roster', validateUUID('id'), classroomController.getCohortRoster);
router.get(
  '/classroom/cohorts/:id/roster-candidates',
  validateUUID('id'),
  classroomController.searchRosterAddCandidates
);
router.post(
  '/classroom/cohorts/:id/join',
  validateUUID('id'),
  validateRequired(['enrollmentId']),
  classroomController.joinCohort
);
router.delete(
  '/classroom/cohorts/:cohortId/enrollments/:enrollmentId',
  validateUUID('cohortId'),
  validateUUID('enrollmentId'),
  classroomController.removeCohortEnrollment
);
router.post(
  '/classroom/cohorts/:id/close',
  validateUUID('id'),
  classroomController.closeCohort
);

router.post(
  '/classroom/sessions/:id/attendance',
  validateUUID('id'),
  validateRequired(['enrollmentId']),
  classroomController.recordAttendance
);

router.get('/classroom/make-up-candidates', classroomController.searchMakeUpCandidates);
router.get('/classroom/online-in-progress', classroomController.getOnlineDeInProgress);

export default router;

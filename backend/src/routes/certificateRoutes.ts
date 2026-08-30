/**
 * Certificate Routes
 * Certificate issuance tracking (13 CCR §340.27).
 */

import { Router } from 'express';
import * as certificateController from '../controllers/certificateController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

router.get('/certificates/worklist', certificateController.getWorklist);
router.get('/certificates/counts', certificateController.getCounts);
router.get('/certificates/log', certificateController.getLog);
router.get('/certificates/for-enrollments', certificateController.getForEnrollments);
router.get('/certificates/:id', validateUUID('id'), certificateController.getCertificateDetail);

router.post(
  '/enrollments/:enrollmentId/certificate',
  validateUUID('enrollmentId'),
  validateRequired(['serialNumber', 'issueDate']),
  certificateController.recordCertificate
);

router.post(
  '/certificates/void',
  validateRequired(['serialNumber', 'voidReason', 'issueDate']),
  certificateController.recordVoid
);

export default router;

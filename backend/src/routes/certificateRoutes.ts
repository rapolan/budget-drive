/**
 * Certificate Routes
 * Certificate issuance tracking (13 CCR §340.27).
 */

import { Router } from 'express';
import * as certificateController from '../controllers/certificateController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

// Certificate reconciliation is admin/staff work - not part of the
// instructor-view design (instructors hand a physical certificate to a
// student; the admin reconciles it here afterward). Applied per-route
// (not via router.use()) since this router is mounted at the generic
// API_PREFIX, not a /certificates-scoped sub-path - a router.use() gate
// here would incorrectly intercept every OTHER route mounted at the same
// generic prefix after this router (classroom, calendar-feed, etc.).
const certificatesOnly = requireRole('owner', 'admin', 'staff');

router.get('/certificates/worklist', certificatesOnly, certificateController.getWorklist);
router.get('/certificates/de-worklist', certificatesOnly, certificateController.getDeWorklist);
router.get('/certificates/counts', certificatesOnly, certificateController.getCounts);
router.get('/certificates/log', certificatesOnly, certificateController.getLog);
router.get('/certificates/for-enrollments', certificatesOnly, certificateController.getForEnrollments);
router.get('/certificates/:id', validateUUID('id'), certificatesOnly, certificateController.getCertificateDetail);

router.post(
  '/enrollments/:enrollmentId/certificate',
  validateUUID('enrollmentId'),
  validateRequired(['serialNumber', 'issueDate']),
  certificatesOnly,
  certificateController.recordCertificate
);

router.post(
  '/enrollments/:enrollmentId/complete-and-issue-de-certificate',
  validateUUID('enrollmentId'),
  validateRequired(['serialNumber', 'issueDate']),
  certificatesOnly,
  certificateController.completeAndIssueDeCertificate
);

router.post(
  '/certificates/void',
  validateRequired(['serialNumber', 'voidReason', 'issueDate']),
  certificatesOnly,
  certificateController.recordVoid
);

export default router;

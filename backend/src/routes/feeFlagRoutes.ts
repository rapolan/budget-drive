/**
 * Fee Flag Routes
 */

import { Router } from 'express';
import * as feeFlagController from '../controllers/feeFlagController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

router.get(
  '/students/:studentId/fee-flags',
  validateUUID('studentId'),
  feeFlagController.getOutstandingFlagsForStudent
);

router.get(
  '/instructors/:instructorId/fee-flags',
  validateUUID('instructorId'),
  feeFlagController.getFeeFlagsForInstructor
);

router.post(
  '/fee-flags/:id/waive',
  validateUUID('id'),
  feeFlagController.waiveFeeFlag
);

router.post(
  '/fee-flags/:id/record-payment',
  validateUUID('id'),
  feeFlagController.recordPaymentForFeeFlag
);

export default router;

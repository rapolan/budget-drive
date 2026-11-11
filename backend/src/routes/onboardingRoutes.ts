/**
 * Onboarding Routes
 * First-login wizard resume/redirect state.
 */

import { Router } from 'express';
import * as onboardingController from '../controllers/onboardingController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

// Read-only - any active tenant member reading this is harmless.
router.get('/onboarding/status', onboardingController.getStatus);

// Write - only an owner/admin can reach the wizard per the frontend's
// own RequireRole gate, enforced again here server-side. Per-route, not
// router.use(), matching the one correct existing pattern in this
// codebase and avoiding the historical router-level-middleware-leak bug
// (see financialAdminRouteRoleGating.test.ts).
router.post('/onboarding/complete', requireRole('owner', 'admin'), onboardingController.complete);

export default router;

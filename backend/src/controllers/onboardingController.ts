/**
 * Onboarding Controller
 * HTTP handlers for the first-login wizard's resume/redirect state.
 * Separate from the wizard's actual data (school details, offerings,
 * defaults, team) - those are saved via the existing /tenant/settings,
 * /availability/settings, and /instructors endpoints.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getTenantId } from '../middleware/tenantContext';
import * as tenantService from '../services/tenantService';

/**
 * @route   GET /api/v1/onboarding/status
 * @desc    Whether this tenant's first-login wizard has been completed
 *          (or explicitly left) - drives the frontend's /onboarding
 *          redirect decision.
 * @access  Private (any active tenant member - read-only, harmless)
 */
export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const settings = await tenantService.getTenantSettings(tenantId);

  res.json({
    success: true,
    data: { onboardingCompletedAt: settings?.onboardingCompletedAt ?? null },
  });
});

/**
 * @route   POST /api/v1/onboarding/complete
 * @desc    Marks the wizard as finished - called when the wizard reaches
 *          its final step, or when the owner/admin explicitly leaves via
 *          the "finish later" exit. Idempotent.
 * @access  Private (owner/admin only)
 */
export const complete = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  await tenantService.markOnboardingCompleted(tenantId);

  res.json({
    success: true,
    data: null,
    message: 'Onboarding marked complete.',
  });
});

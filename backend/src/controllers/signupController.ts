/**
 * Self-Service Signup Controller
 * Public HTTP handlers for invite-code validation and signup itself.
 * Both routes are registered directly on app.ts (not through a Router),
 * mounted before any authenticated router - see app.ts for why.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as tenantSignupService from '../services/tenantSignupService';

/**
 * @route   POST /api/v1/signup/validate-code
 * @desc    Read-only check that an invite code currently works - never
 *          claims it. Reveals nothing beyond a boolean.
 * @access  Public
 */
export const validateCode = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;

  const valid = await tenantSignupService.validateInviteCode(code);

  if (!valid) {
    res.status(400).json({
      success: false,
      error: 'This invite code is invalid or has expired.',
    });
    return;
  }

  res.json({
    success: true,
    data: { valid: true },
  });
});

/**
 * @route   POST /api/v1/signup
 * @desc    Claims a single-use invite code and creates a brand-new
 *          tenant + owner account in one transaction, then logs the
 *          owner in (same token shape as a normal login).
 * @access  Public (gated behind a valid invite code)
 */
export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { code, schoolName, ownerFullName, ownerEmail, ownerPassword, termsAccepted, termsVersion } = req.body;

  // termsAccepted is checked explicitly here, not via validateRequired's
  // generic falsy-field check, so the rejection message is accurate -
  // "you must accept the terms," not a generic "missing field" (false is
  // itself a valid, deliberate value for this field, not a missing one).
  if (termsAccepted !== true) {
    res.status(400).json({
      success: false,
      error: 'You must accept the Terms of Service and Privacy Policy to continue.',
    });
    return;
  }

  if (typeof termsVersion !== 'string' || termsVersion.trim().length === 0 || termsVersion.length > 64) {
    res.status(400).json({
      success: false,
      error: 'A valid termsVersion is required.',
    });
    return;
  }

  if (typeof ownerPassword !== 'string' || ownerPassword.length < 8) {
    res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters long',
    });
    return;
  }

  const result = await tenantSignupService.signupNewTenant({
    code,
    schoolName,
    ownerFullName,
    ownerEmail,
    ownerPassword,
    termsVersion,
  });

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      tenantId: result.tenantId,
    },
    message: 'Account created successfully.',
  });
});

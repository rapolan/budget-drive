/**
 * Tenant Controller
 * HTTP handlers for tenant-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as tenantService from '../services/tenantService';
import { getBookingEligibilityPreview } from '../services/bookingEligibilityService';
import { getTenantId } from '../middleware/tenantContext';
import { resolveTenantTimezone } from '../utils/tenantTime';

/**
 * @route   GET /api/v1/tenant/current
 * @desc    Get current tenant info (full details including type)
 * @access  Private
 */
export const getCurrentTenant = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const tenant = await tenantService.getTenantById(tenantId);

  if (!tenant) {
    res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
    return;
  }

  res.json({
    success: true,
    data: tenant,
  });
});

/**
 * @route   GET /api/v1/tenant/settings
 * @desc    Get current tenant settings
 * @access  Private
 */
export const getTenantSettings = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const settings = await tenantService.getTenantSettings(tenantId);

  if (!settings) {
    res.status(404).json({
      success: false,
      error: 'Tenant settings not found',
    });
    return;
  }

  const timezone = resolveTenantTimezone(settings.timezone);

  res.json({
    success: true,
    data: { ...settings, tenantNow: tenantService.getTenantNow(timezone) },
  });
});

/**
 * @route   PUT /api/v1/tenant/settings
 * @desc    Update current tenant settings
 * @access  Private
 */
export const updateTenantSettings = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const settings = await tenantService.updateTenantSettings(tenantId, req.body);

  res.json({
    success: true,
    data: settings,
    message: 'Tenant settings updated successfully',
  });
});

/**
 * @route   GET /api/v1/tenant/booking-eligibility-preview
 * @desc    "Preview: students who couldn't book today" (payment-before-
 *          booking's safety report) - read-only, owner/admin only
 *          (route-gated), works even while the setting itself is OFF, so
 *          an owner can review real students/numbers before turning the
 *          toggle on. Never mutates anything.
 * @access  Private (owner/admin)
 */
export const getBookingEligibilityPreviewReport = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const rows = await getBookingEligibilityPreview(tenantId);

  res.json({
    success: true,
    data: rows,
  });
});

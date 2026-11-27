/**
 * Tenant Routes
 * API routes for tenant management
 */

import { Router } from 'express';
import * as tenantController from '../controllers/tenantController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';

const router = Router();

// =====================================================
// MULTI-TENANT ROUTES (require authentication + tenant context)
// =====================================================

// Get current tenant info (full tenant details including type)
router.get(
  '/tenant/current',
  authenticate,
  requireTenantContext,
  tenantController.getCurrentTenant
);

// Get current tenant settings (scoped to authenticated user's tenant)
router.get(
  '/tenant/settings',
  authenticate,
  requireTenantContext,
  tenantController.getTenantSettings
);

// Update current tenant settings - admin-only write; wide open to any
// authenticated tenant member (instructor included) before this fix.
router.put(
  '/tenant/settings',
  authenticate,
  requireTenantContext,
  requireRole('owner', 'admin'),
  tenantController.updateTenantSettings
);

// "Preview: students who couldn't book today" (payment-before-booking
// safety report) - owner/admin only, same gate as the settings write
// above; read-only but shows real student names/balances, so it's not
// open to every tenant member the way GET /tenant/settings itself is.
router.get(
  '/tenant/booking-eligibility-preview',
  authenticate,
  requireTenantContext,
  requireRole('owner', 'admin'),
  tenantController.getBookingEligibilityPreviewReport
);

export default router;

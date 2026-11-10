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

export default router;

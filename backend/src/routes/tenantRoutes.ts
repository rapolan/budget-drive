/**
 * Tenant Routes
 * API routes for tenant management
 */

import { Router } from 'express';
import * as tenantController from '../controllers/tenantController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';
import { validateUUID, validateRequired } from '../middleware/validate';

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

// =====================================================
// ADMIN TENANT MANAGEMENT ROUTES
// =====================================================

// Get all tenants (admin only)
router.get(
  '/tenants',
  authenticate,
  tenantController.getAllTenants
);

// Create new tenant (admin only)
router.post(
  '/tenants',
  authenticate,
  validateRequired(['name', 'slug', 'email']),
  tenantController.createTenant
);

// =====================================================
// PROTECTED ID-BASED ROUTES
// =====================================================

// Get tenant by ID
router.get(
  '/tenants/:id',
  authenticate,
  validateUUID('id'),
  tenantController.getTenant
);

// Update tenant
router.put(
  '/tenants/:id',
  authenticate,
  validateUUID('id'),
  tenantController.updateTenant
);

// Delete tenant (soft delete)
router.delete(
  '/tenants/:id',
  authenticate,
  validateUUID('id'),
  tenantController.deleteTenant
);

export default router;

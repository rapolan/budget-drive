/**
 * Tenant Routes
 * API routes for tenant management
 */

import { Router } from 'express';
import * as tenantController from '../controllers/tenantController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
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

// Update current tenant settings
router.put(
  '/tenant/settings',
  authenticate,
  requireTenantContext,
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
// PUBLIC ROUTES
// =====================================================

// IMPORTANT: This must be BEFORE /tenants/:id to prevent "slug" being matched as an ID
// Get tenant by slug (public - for white-label sites)
router.get(
  '/tenants/slug/:slug',
  tenantController.getTenantBySlug
);

// =====================================================
// PROTECTED ID-BASED ROUTES (must come after specific routes)
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

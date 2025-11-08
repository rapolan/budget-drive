/**
 * Tenant Controller
 * HTTP handlers for tenant-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as tenantService from '../services/tenantService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/tenants/:id
 * @desc    Get tenant by ID with full settings
 * @access  Private
 */
export const getTenant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tenant = await tenantService.getTenantById(id);

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
 * @route   GET /api/v1/tenants/slug/:slug
 * @desc    Get tenant by slug
 * @access  Public
 */
export const getTenantBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const tenant = await tenantService.getTenantBySlug(slug);

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
 * @route   GET /api/v1/tenants
 * @desc    Get all tenants (admin only)
 * @access  Private (Admin)
 */
export const getAllTenants = asyncHandler(async (_req: Request, res: Response) => {
  const tenants = await tenantService.getAllTenants();

  res.json({
    success: true,
    data: tenants,
    count: tenants.length,
  });
});

/**
 * @route   POST /api/v1/tenants
 * @desc    Create new tenant
 * @access  Private (Admin)
 */
export const createTenant = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await tenantService.createTenant(req.body);

  res.status(201).json({
    success: true,
    data: tenant,
    message: 'Tenant created successfully',
  });
});

/**
 * @route   PUT /api/v1/tenants/:id
 * @desc    Update tenant
 * @access  Private (Admin)
 */
export const updateTenant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tenant = await tenantService.updateTenant(id, req.body);

  res.json({
    success: true,
    data: tenant,
    message: 'Tenant updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/tenants/:id
 * @desc    Delete tenant (soft delete)
 * @access  Private (Admin)
 */
export const deleteTenant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await tenantService.deleteTenant(id);

  res.json({
    success: true,
    message: 'Tenant deleted successfully',
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

  res.json({
    success: true,
    data: settings,
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

/**
 * Guardian Controller
 * HTTP handlers for guardian-related endpoints
 *
 * No role-based data isolation here, unlike students: a guardian can be
 * linked to students assigned to different instructors, so there's no
 * single "owning instructor" to gate on. Guardian contact info is visible
 * to all authenticated tenant members.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as guardianService from '../services/guardianService';
import * as studentGuardianService from '../services/studentGuardianService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/guardians
 * @desc    Get all guardians for current tenant (paginated)
 * @access  Private
 */
export const getAllGuardians = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const result = await guardianService.getAllGuardians(tenantId, page, limit);

  res.json({
    success: true,
    data: result.guardians,
    pagination: {
      page: result.page,
      limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/**
 * @route   GET /api/v1/guardians/:id
 * @desc    Get guardian by ID
 * @access  Private
 */
export const getGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const guardian = await guardianService.getGuardianById(id, tenantId);

  if (!guardian) {
    res.status(404).json({
      success: false,
      error: 'Guardian not found',
    });
    return;
  }

  res.json({
    success: true,
    data: guardian,
  });
});

/**
 * @route   POST /api/v1/guardians
 * @desc    Create new guardian
 * @access  Private
 */
export const createGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;

  const guardian = await guardianService.createGuardian(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: guardian,
    message: 'Guardian created successfully',
  });
});

/**
 * @route   PUT /api/v1/guardians/:id
 * @desc    Update guardian
 * @access  Private
 */
export const updateGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const guardian = await guardianService.updateGuardian(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: guardian,
    message: 'Guardian updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/guardians/:id
 * @desc    Delete guardian (blocked while still linked to any student)
 * @access  Private
 */
export const deleteGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await guardianService.deleteGuardian(id, tenantId);

  res.json({
    success: true,
    message: 'Guardian deleted successfully',
  });
});

/**
 * @route   GET /api/v1/guardians/:id/students
 * @desc    Get students linked to a guardian
 * @access  Private
 */
export const getStudentsForGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const students = await studentGuardianService.getStudentsForGuardian(id, tenantId);

  res.json({
    success: true,
    data: students,
  });
});

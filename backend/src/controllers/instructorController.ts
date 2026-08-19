/**
 * Instructor Controller
 * HTTP handlers for instructor-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as instructorService from '../services/instructorService';
import * as instructorServiceAreaService from '../services/instructorServiceAreaService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/instructors
 * @desc    Get all instructors for current tenant
 * @access  Private
 */
export const getAllInstructors = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const instructors = await instructorService.getAllInstructors(tenantId);

  res.json({
    success: true,
    data: instructors,
    count: instructors.length,
  });
});

/**
 * @route   GET /api/v1/instructors/:id
 * @desc    Get instructor by ID
 * @access  Private
 */
export const getInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const instructor = await instructorService.getInstructorById(id, tenantId);

  if (!instructor) {
    res.status(404).json({
      success: false,
      error: 'Instructor not found',
    });
    return;
  }

  res.json({
    success: true,
    data: instructor,
  });
});

/**
 * @route   POST /api/v1/instructors
 * @desc    Create new instructor
 * @access  Private
 */
export const createInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;

  const instructor = await instructorService.createInstructor(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: instructor,
    message: 'Instructor created successfully',
  });
});

/**
 * @route   PUT /api/v1/instructors/:id
 * @desc    Update instructor
 * @access  Private
 */
export const updateInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const instructor = await instructorService.updateInstructor(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: instructor,
    message: 'Instructor updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/instructors/:id
 * @desc    Delete instructor (soft delete)
 * @access  Private
 */
export const deleteInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await instructorService.deleteInstructor(id, tenantId);

  res.json({
    success: true,
    message: 'Instructor deleted successfully',
  });
});

/**
 * @route   GET /api/v1/instructors/:id/earnings
 * @desc    Get instructor earnings
 * @access  Private
 */
export const getInstructorEarnings = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  const earnings = await instructorService.getInstructorEarnings(
    id,
    tenantId,
    startDate as string | undefined,
    endDate as string | undefined
  );

  res.json({
    success: true,
    data: earnings,
  });
});

/**
 * @route   GET /api/v1/instructors/:id/service-areas
 * @desc    Get the ZIP codes an instructor serves (empty = serves everywhere)
 * @access  Private
 */
export const getServiceAreas = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const zipCodes = await instructorServiceAreaService.getServiceAreas(id, tenantId);

  res.json({
    success: true,
    data: zipCodes,
  });
});

/**
 * @route   PUT /api/v1/instructors/:id/service-areas
 * @desc    Replace the full list of ZIP codes an instructor serves
 * @access  Private
 */
export const setServiceAreas = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const zipCodes = await instructorServiceAreaService.setServiceAreas(id, tenantId, req.body.zipCodes);

  res.json({
    success: true,
    data: zipCodes,
  });
});

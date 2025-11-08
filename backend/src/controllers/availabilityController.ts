/**
 * Availability Controller
 * HTTP handlers for availability management endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as availabilityService from '../services/availabilityService';
import * as schedulingService from '../services/schedulingService';
import { getTenantId } from '../middleware/tenantContext';

// =====================================================
// INSTRUCTOR AVAILABILITY
// =====================================================

/**
 * @route   GET /api/v1/availability/instructor/:instructorId
 * @desc    Get instructor's recurring availability schedule
 * @access  Private
 */
export const getInstructorAvailability = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  const availability = await availabilityService.getInstructorAvailability(instructorId, tenantId);

  res.json({
    success: true,
    data: availability,
  });
});

/**
 * @route   GET /api/v1/availability/all
 * @desc    Get all instructors' availability
 * @access  Private
 */
export const getAllInstructorsAvailability = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const availability = await availabilityService.getAllInstructorsAvailability(tenantId);

  res.json({
    success: true,
    data: availability,
  });
});

/**
 * @route   POST /api/v1/availability/instructor/:instructorId
 * @desc    Create availability entry for instructor
 * @access  Private
 */
export const createAvailability = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  const availability = await availabilityService.createAvailability(
    tenantId,
    instructorId,
    req.body
  );

  res.status(201).json({
    success: true,
    data: availability,
    message: 'Availability created successfully',
  });
});

/**
 * @route   PUT /api/v1/availability/:id
 * @desc    Update availability entry
 * @access  Private
 */
export const updateAvailability = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const availability = await availabilityService.updateAvailability(id, tenantId, req.body);

  res.json({
    success: true,
    data: availability,
    message: 'Availability updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/availability/:id
 * @desc    Delete (deactivate) availability entry
 * @access  Private
 */
export const deleteAvailability = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await availabilityService.deleteAvailability(id, tenantId);

  res.json({
    success: true,
    message: 'Availability deleted successfully',
  });
});

/**
 * @route   POST /api/v1/availability/instructor/:instructorId/schedule
 * @desc    Set complete schedule for instructor (replaces existing)
 * @access  Private
 */
export const setInstructorSchedule = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;
  const { schedule } = req.body;

  const availability = await availabilityService.setInstructorSchedule(
    tenantId,
    instructorId,
    schedule
  );

  res.json({
    success: true,
    data: availability,
    message: 'Instructor schedule set successfully',
  });
});

// =====================================================
// TIME OFF
// =====================================================

/**
 * @route   GET /api/v1/availability/instructor/:instructorId/time-off
 * @desc    Get instructor's time off
 * @access  Private
 */
export const getInstructorTimeOff = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;
  const { startDate, endDate } = req.query;

  const timeOff = await availabilityService.getInstructorTimeOff(
    instructorId,
    tenantId,
    startDate ? new Date(startDate as string) : undefined,
    endDate ? new Date(endDate as string) : undefined
  );

  res.json({
    success: true,
    data: timeOff,
  });
});

/**
 * @route   POST /api/v1/availability/instructor/:instructorId/time-off
 * @desc    Create time off for instructor
 * @access  Private
 */
export const createTimeOff = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  const timeOff = await availabilityService.createTimeOff(tenantId, instructorId, req.body);

  res.status(201).json({
    success: true,
    data: timeOff,
    message: 'Time off created successfully',
  });
});

/**
 * @route   PUT /api/v1/availability/time-off/:id
 * @desc    Update time off
 * @access  Private
 */
export const updateTimeOff = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const timeOff = await availabilityService.updateTimeOff(id, tenantId, req.body);

  res.json({
    success: true,
    data: timeOff,
    message: 'Time off updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/availability/time-off/:id
 * @desc    Delete time off
 * @access  Private
 */
export const deleteTimeOff = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await availabilityService.deleteTimeOff(id, tenantId);

  res.json({
    success: true,
    message: 'Time off deleted successfully',
  });
});

// =====================================================
// SCHEDULING SETTINGS
// =====================================================

/**
 * @route   GET /api/v1/availability/settings
 * @desc    Get scheduling settings
 * @access  Private
 */
export const getSchedulingSettings = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const settings = await availabilityService.getSchedulingSettings(tenantId);

  res.json({
    success: true,
    data: settings,
  });
});

/**
 * @route   PUT /api/v1/availability/settings
 * @desc    Update scheduling settings
 * @access  Private
 */
export const updateSchedulingSettings = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const settings = await availabilityService.updateSchedulingSettings(tenantId, req.body);

  res.json({
    success: true,
    data: settings,
    message: 'Scheduling settings updated successfully',
  });
});

// =====================================================
// SMART SCHEDULING
// =====================================================

/**
 * @route   POST /api/v1/availability/find-slots
 * @desc    Find available time slots
 * @access  Private
 */
export const findAvailableSlots = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId, vehicleId, startDate, endDate, duration, studentId } = req.body;

  const slots = await schedulingService.findAvailableSlots({
    tenantId,
    instructorId,
    vehicleId,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    duration,
    studentId,
  });

  res.json({
    success: true,
    data: slots,
    count: slots.length,
  });
});

/**
 * @route   POST /api/v1/availability/check-conflicts
 * @desc    Check for scheduling conflicts
 * @access  Private
 */
export const checkConflicts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId, studentId, vehicleId, startTime, endTime, excludeLessonId } = req.body;

  const conflicts = await schedulingService.checkSchedulingConflicts(
    tenantId,
    instructorId,
    studentId,
    vehicleId || null,
    new Date(startTime),
    new Date(endTime),
    excludeLessonId
  );

  res.json({
    success: true,
    hasConflicts: conflicts.length > 0,
    conflicts,
  });
});

/**
 * @route   POST /api/v1/availability/validate-booking
 * @desc    Validate lesson booking
 * @access  Private
 */
export const validateBooking = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId, studentId, vehicleId, startTime, endTime, excludeLessonId } = req.body;

  const validation = await schedulingService.validateLessonBooking(
    tenantId,
    instructorId,
    studentId,
    vehicleId || null,
    new Date(startTime),
    new Date(endTime),
    excludeLessonId
  );

  res.json({
    success: true,
    valid: validation.valid,
    conflicts: validation.conflicts,
  });
});

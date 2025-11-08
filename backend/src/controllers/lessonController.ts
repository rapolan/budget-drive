/**
 * Lesson Controller
 * HTTP handlers for lesson-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as lessonService from '../services/lessonService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/lessons
 * @desc    Get all lessons for current tenant (paginated)
 * @access  Private
 */
export const getAllLessons = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const result = await lessonService.getAllLessons(tenantId, page, limit);

  res.json({
    success: true,
    data: result.lessons,
    pagination: {
      page: result.page,
      limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/**
 * @route   GET /api/v1/lessons/:id
 * @desc    Get lesson by ID
 * @access  Private
 */
export const getLesson = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const lesson = await lessonService.getLessonById(id, tenantId);

  if (!lesson) {
    res.status(404).json({
      success: false,
      error: 'Lesson not found',
    });
    return;
  }

  res.json({
    success: true,
    data: lesson,
  });
});

/**
 * @route   POST /api/v1/lessons
 * @desc    Create new lesson
 * @access  Private
 */
export const createLesson = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const lesson = await lessonService.createLesson(tenantId, req.body);

  res.status(201).json({
    success: true,
    data: lesson,
    message: 'Lesson created successfully',
  });
});

/**
 * @route   PUT /api/v1/lessons/:id
 * @desc    Update lesson
 * @access  Private
 */
export const updateLesson = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const lesson = await lessonService.updateLesson(id, tenantId, req.body);

  res.json({
    success: true,
    data: lesson,
    message: 'Lesson updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/lessons/:id
 * @desc    Cancel lesson (soft delete)
 * @access  Private
 */
export const deleteLesson = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await lessonService.deleteLesson(id, tenantId);

  res.json({
    success: true,
    message: 'Lesson cancelled successfully',
  });
});

/**
 * @route   GET /api/v1/lessons/student/:studentId
 * @desc    Get lessons by student
 * @access  Private
 */
export const getLessonsByStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { studentId } = req.params;

  const lessons = await lessonService.getLessonsByStudent(tenantId, studentId);

  res.json({
    success: true,
    data: lessons,
    count: lessons.length,
  });
});

/**
 * @route   GET /api/v1/lessons/instructor/:instructorId
 * @desc    Get lessons by instructor
 * @access  Private
 */
export const getLessonsByInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  const lessons = await lessonService.getLessonsByInstructor(tenantId, instructorId);

  res.json({
    success: true,
    data: lessons,
    count: lessons.length,
  });
});

/**
 * @route   GET /api/v1/lessons/status/:status
 * @desc    Get lessons by status
 * @access  Private
 */
export const getLessonsByStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { status } = req.params;

  const lessons = await lessonService.getLessonsByStatus(
    tenantId,
    status as 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  );

  res.json({
    success: true,
    data: lessons,
    count: lessons.length,
  });
});

/**
 * @route   GET /api/v1/lessons/date-range
 * @desc    Get lessons by date range
 * @access  Private
 */
export const getLessonsByDateRange = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'startDate and endDate query parameters are required',
    });
    return;
  }

  const lessons = await lessonService.getLessonsByDateRange(
    tenantId,
    new Date(startDate as string),
    new Date(endDate as string)
  );

  res.json({
    success: true,
    data: lessons,
    count: lessons.length,
  });
});

/**
 * @route   POST /api/v1/lessons/:id/complete
 * @desc    Mark lesson as completed
 * @access  Private
 */
export const completeLesson = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const lesson = await lessonService.completeLesson(id, tenantId);

  res.json({
    success: true,
    data: lesson,
    message: 'Lesson marked as completed',
  });
});

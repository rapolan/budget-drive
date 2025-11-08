/**
 * Student Controller
 * HTTP handlers for student-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as studentService from '../services/studentService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/students
 * @desc    Get all students for current tenant (paginated)
 * @access  Private
 */
export const getAllStudents = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const result = await studentService.getAllStudents(tenantId, page, limit);

  res.json({
    success: true,
    data: result.students,
    pagination: {
      page: result.page,
      limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/**
 * @route   GET /api/v1/students/:id
 * @desc    Get student by ID
 * @access  Private
 */
export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const student = await studentService.getStudentById(id, tenantId);

  if (!student) {
    res.status(404).json({
      success: false,
      error: 'Student not found',
    });
    return;
  }

  res.json({
    success: true,
    data: student,
  });
});

/**
 * @route   POST /api/v1/students
 * @desc    Create new student
 * @access  Private
 */
export const createStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const student = await studentService.createStudent(tenantId, req.body);

  res.status(201).json({
    success: true,
    data: student,
    message: 'Student created successfully',
  });
});

/**
 * @route   PUT /api/v1/students/:id
 * @desc    Update student
 * @access  Private
 */
export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const student = await studentService.updateStudent(id, tenantId, req.body);

  res.json({
    success: true,
    data: student,
    message: 'Student updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/students/:id
 * @desc    Delete student (soft delete)
 * @access  Private
 */
export const deleteStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await studentService.deleteStudent(id, tenantId);

  res.json({
    success: true,
    message: 'Student deleted successfully',
  });
});

/**
 * @route   GET /api/v1/students/status/:status
 * @desc    Get students by status
 * @access  Private
 */
export const getStudentsByStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { status } = req.params;

  const students = await studentService.getStudentsByStatus(
    tenantId,
    status as 'active' | 'completed' | 'inactive' | 'suspended'
  );

  res.json({
    success: true,
    data: students,
    count: students.length,
  });
});

/**
 * @route   GET /api/v1/students/instructor/:instructorId
 * @desc    Get students assigned to an instructor
 * @access  Private
 */
export const getStudentsByInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  const students = await studentService.getStudentsByInstructor(tenantId, instructorId);

  res.json({
    success: true,
    data: students,
    count: students.length,
  });
});

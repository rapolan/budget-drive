/**
 * Student Controller
 * HTTP handlers for student-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as studentService from '../services/studentService';
import * as studentGuardianService from '../services/studentGuardianService';
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

  // Enforce role-based data isolation for instructors
  if (req.user?.role === 'instructor' && req.user?.instructorId) {
    const students = await studentService.getStudentsByInstructor(tenantId, req.user.instructorId);
    res.json({
      success: true,
      data: students,
      pagination: {
        page: 1,
        limit: students.length > 0 ? students.length : limit,
        total: students.length,
        totalPages: 1,
      },
    });
    return;
  }

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

  // Enforce access control: instructors can only view their own students
  if (req.user?.role === 'instructor' && student.assignedInstructorId !== req.user?.instructorId) {
    res.status(403).json({
      success: false,
      error: 'Access denied: You can only view your own assigned students',
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
  const userId = req.user?.userId;

  const student = await studentService.createStudent(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: student,
    message: 'Student created successfully',
  });
});

/**
 * @route   POST /api/v1/students/with-guardian
 * @desc    Atomically create a student and create-or-link a guardian in a
 *          single transaction - a failure at any step leaves nothing
 *          persisted (no orphaned student, no orphaned guardian)
 * @access  Private
 */
export const createStudentWithGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;

  const result = await studentService.createStudentWithGuardian(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Student and guardian created successfully',
  });
});

/**
 * @route   PUT /api/v1/students/:id
 * @desc    Update student
 * @access  Private
 */
export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const student = await studentService.updateStudent(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: student,
    message: 'Student updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/students/:id
 * @desc    Delete student (hard delete - will be soft delete with blockchain)
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
 * @route   POST /api/v1/students/:id/complete
 * @desc    Mark a student's program complete
 * @access  Private
 */
export const completeStudentProgram = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const student = await studentService.markStudentCompleted(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: student,
    message: 'Student program marked complete',
  });
});

/**
 * @route   POST /api/v1/students/:id/reopen
 * @desc    Reverse an accidental program completion
 * @access  Private
 */
export const reopenStudentProgram = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const student = await studentService.unmarkStudentCompleted(id, tenantId);

  res.json({
    success: true,
    data: student,
    message: 'Student program reopened',
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

/**
 * @route   GET /api/v1/students/:id/guardians
 * @desc    Get guardians linked to a student
 * @access  Private
 */
export const getGuardiansForStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const guardians = await studentGuardianService.getGuardiansForStudent(id, tenantId);

  res.json({
    success: true,
    data: guardians,
  });
});

/**
 * @route   POST /api/v1/students/:id/guardians
 * @desc    Link a guardian to a student (explicit choice only - Constraint B)
 * @access  Private
 */
export const linkGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;
  const { guardianId, relationship, isPrimary } = req.body;

  const link = await studentGuardianService.linkGuardianToStudent(
    id,
    guardianId,
    tenantId,
    { relationship, isPrimary },
    userId
  );

  res.status(201).json({
    success: true,
    data: link,
    message: 'Guardian linked to student',
  });
});

/**
 * @route   DELETE /api/v1/students/:id/guardians/:guardianId
 * @desc    Unlink a guardian from a student
 * @access  Private
 */
export const unlinkGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id, guardianId } = req.params;

  await studentGuardianService.unlinkGuardianFromStudent(id, guardianId, tenantId);

  res.json({
    success: true,
    message: 'Guardian unlinked from student',
  });
});

/**
 * @route   PUT /api/v1/students/:id/guardians/:guardianId/primary
 * @desc    Set a guardian as the primary guardian for a student
 * @access  Private
 */
export const setPrimaryGuardian = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id, guardianId } = req.params;

  await studentGuardianService.setPrimaryGuardian(id, guardianId, tenantId);

  res.json({
    success: true,
    message: 'Primary guardian updated',
  });
});

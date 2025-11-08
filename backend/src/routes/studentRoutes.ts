/**
 * Student Routes
 * API routes for student management
 */

import { Router } from 'express';
import * as studentController from '../controllers/studentController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

// All student routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Get students by status
router.get(
  '/students/status/:status',
  studentController.getStudentsByStatus
);

// Get students by instructor
router.get(
  '/students/instructor/:instructorId',
  validateUUID('instructorId'),
  studentController.getStudentsByInstructor
);

// Get all students (paginated)
router.get(
  '/students',
  studentController.getAllStudents
);

// Create new student
router.post(
  '/students',
  validateRequired([
    'fullName',
    'email',
    'phone',
    'dateOfBirth',
    'address',
    'emergencyContact',
    'licenseType',
    'hoursRequired',
  ]),
  studentController.createStudent
);

// Get student by ID
router.get(
  '/students/:id',
  validateUUID('id'),
  studentController.getStudent
);

// Update student
router.put(
  '/students/:id',
  validateUUID('id'),
  studentController.updateStudent
);

// Delete student (soft delete)
router.delete(
  '/students/:id',
  validateUUID('id'),
  studentController.deleteStudent
);

export default router;

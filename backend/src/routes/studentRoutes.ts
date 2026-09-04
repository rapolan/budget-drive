/**
 * Student Routes
 * API routes for student management
 */

import { Router } from 'express';
import * as studentController from '../controllers/studentController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired, validateRequiredOneOf } from '../middleware/validate';

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
// email is deliberately omitted here - its requirement is conditional on
// age (adults only), which a presence-only route validator can't express;
// that check lives in studentService.createStudent. phone accepts either
// the student's own phone or a parent/guardian's, matching service logic
// that has always allowed either.
router.post(
  '/students',
  validateRequired(['fullName', 'dateOfBirth']),
  validateRequiredOneOf([['phone'], ['emergencyContactPhone']]),
  studentController.createStudent
);

// Atomically create a student and create-or-link one or more guardians in
// one transaction. Separate from the plain POST /students above - that
// route's contract stays untouched for adults and for minors deferring
// guardian setup.
router.post(
  '/students/with-guardian',
  validateRequired(['student', 'guardians']),
  studentController.createStudentWithGuardian
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

// Get every program enrollment for a student
router.get(
  '/students/:id/enrollments',
  validateUUID('id'),
  studentController.getEnrollmentsForStudent
);

// Create a new program enrollment for a student
router.post(
  '/students/:id/enrollments',
  validateUUID('id'),
  validateRequired(['programType']),
  studentController.createEnrollmentForStudent
);

// Directional DE -> BTW enrollment: creates the driver_training enrollment
// and, atomically, optionally updates the permit and/or records DE
// completed elsewhere (the escape hatch) - see enrollmentService.enrollInBtw.
router.post(
  '/students/:id/enroll-in-btw',
  validateUUID('id'),
  studentController.enrollInBtw
);

// Get guardians linked to a student
router.get(
  '/students/:id/guardians',
  validateUUID('id'),
  studentController.getGuardiansForStudent
);

// Link a guardian to a student (explicit choice only - Constraint B)
router.post(
  '/students/:id/guardians',
  validateUUID('id'),
  validateRequired(['guardianId']),
  studentController.linkGuardian
);

// Unlink a guardian from a student
router.delete(
  '/students/:id/guardians/:guardianId',
  validateUUID('id'),
  validateUUID('guardianId'),
  studentController.unlinkGuardian
);

// Set a guardian as the primary guardian for a student
router.put(
  '/students/:id/guardians/:guardianId/primary',
  validateUUID('id'),
  validateUUID('guardianId'),
  studentController.setPrimaryGuardian
);

// Change the relationship on an existing student-guardian link
// (relationship is a property of the link, not the guardian)
router.put(
  '/students/:id/guardians/:guardianId',
  validateUUID('id'),
  validateUUID('guardianId'),
  studentController.updateGuardianRelationship
);

export default router;

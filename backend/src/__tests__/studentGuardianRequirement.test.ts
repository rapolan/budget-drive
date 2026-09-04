import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const ENROLLMENT_ID = '66666666-6666-6666-6666-666666666666';

const minorDob = new Date();
minorDob.setFullYear(minorDob.getFullYear() - 10);

const adultDob = new Date();
adultDob.setFullYear(adultDob.getFullYear() - 25);

describe('needsGuardian attachment', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('a newly-read minor student with no linked guardian has needsGuardian=true', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString() }])) // student row
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings (getStudentById)
      .mockResolvedValueOnce(queryResult([])) // guardian counts - none linked
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])) // enrollments for student
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings (attachProgressAndPayments)
      .mockResolvedValueOnce(queryResult([])) // lessons for enrollment
      .mockResolvedValueOnce(queryResult([])); // payments for enrollment

    const student = await studentService.getStudentById(STUDENT_ID, TENANT_ID);
    expect(student?.needsGuardian).toBe(true);
  });

  it('a minor with one linked guardian has needsGuardian=false', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString() }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([{ student_id: STUDENT_ID, count: '1' }])) // guardian counts
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    const student = await studentService.getStudentById(STUDENT_ID, TENANT_ID);
    expect(student?.needsGuardian).toBe(false);
  });

  it('an adult always has needsGuardian=false, and the guardian-count query is never issued', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString() }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings - no guardian-count/guardians call follows for an adult
      .mockResolvedValueOnce(queryResult([])) // outstanding fees - always runs regardless of age
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    const student = await studentService.getStudentById(STUDENT_ID, TENANT_ID);
    expect(student?.needsGuardian).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(7);
  });

  it('getAllStudents batches the guardian-count query once across multiple minors, not N+1', async () => {
    const studentService = await import('../services/studentService');
    const STUDENT_ID_2 = '55555555-5555-5555-5555-555555555555';

    mockQuery
      .mockResolvedValueOnce(queryResult([{ count: '2' }])) // total count
      .mockResolvedValueOnce(
        queryResult([
          { id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString() },
          { id: STUDENT_ID_2, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString() },
        ])
      ) // student rows
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(
        queryResult([
          { id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false },
        ])
      ) // active driver_training enrollments batch - only STUDENT_ID has one
      .mockResolvedValueOnce(queryResult([])) // getDeEnrollmentsBatch - no DE enrollment
      .mockResolvedValueOnce(queryResult([])) // batched lessons for that enrollment
      .mockResolvedValueOnce(queryResult([])) // batched payments for that enrollment
      .mockResolvedValueOnce(queryResult([{ student_id: STUDENT_ID, count: '1' }])) // batched guardian counts - one call for both
      .mockResolvedValueOnce(queryResult([])) // batched outstanding fees - one call for both
      .mockResolvedValueOnce(queryResult([])); // batched primary guardians - one call for both

    const { students } = await studentService.getAllStudents(TENANT_ID, 1, 50);
    expect(mockQuery).toHaveBeenCalledTimes(10);
    expect(students.find(s => s.id === STUDENT_ID)?.needsGuardian).toBe(false);
    expect(students.find(s => s.id === STUDENT_ID_2)?.needsGuardian).toBe(true);
  });

  it('markEnrollmentCompleted rejects a minor with needsGuardian=true', async () => {
    const enrollmentService = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([{ date_of_birth: minorDob.toISOString(), guardian_count: '0' }])) // person + guardian count join
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings for age calc

    await expect(
      enrollmentService.markEnrollmentCompleted(ENROLLMENT_ID, TENANT_ID, {}, 'staff-1')
    ).rejects.toThrow('no linked guardian');
  });

  it('markEnrollmentCompleted succeeds for a minor once a guardian is linked', async () => {
    const enrollmentService = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([{ date_of_birth: minorDob.toISOString(), guardian_count: '1' }])) // person + guardian count join - guardian linked
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, completed: true, status: 'completed' }])); // the UPDATE

    await expect(
      enrollmentService.markEnrollmentCompleted(ENROLLMENT_ID, TENANT_ID, {}, 'staff-1')
    ).resolves.toMatchObject({ completed: true });
  });

  it('markEnrollmentCompleted succeeds for an adult with zero guardians', async () => {
    const enrollmentService = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([{ date_of_birth: adultDob.toISOString(), guardian_count: '0' }])) // person + guardian count join - adult, gate doesn't apply
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, completed: true, status: 'completed' }])); // the UPDATE

    await expect(
      enrollmentService.markEnrollmentCompleted(ENROLLMENT_ID, TENANT_ID, {}, 'staff-1')
    ).resolves.toMatchObject({ completed: true });
  });
});

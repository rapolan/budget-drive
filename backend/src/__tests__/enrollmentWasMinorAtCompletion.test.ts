import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';

/**
 * wasMinorAtCompletion must be evaluated against the ENROLLMENT's own
 * completion date, in the tenant's timezone - not today's date, and not
 * the server/browser's local time. This is the exact date-boundary
 * regression the certificate feature must not reintroduce: a student who
 * completed as a minor years ago, and is an adult today, must still
 * report wasMinorAtCompletion: true.
 */
describe('enrollmentService.getEnrollmentsForStudent - wasMinorAtCompletion', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('is true for a student who was a minor AS OF completion, even though they are an adult today', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    const completedAt = new Date();
    completedAt.setFullYear(completedAt.getFullYear() - 5); // completed 5 years ago
    const dob = new Date(completedAt);
    dob.setFullYear(dob.getFullYear() - 17); // 17 (minor) at completion time; ~22 today

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_training',
          status: 'completed',
          hours_required: 6,
          completed: true,
          completed_at: completedAt.toISOString(),
          completion_reason: null,
          track_override: null,
        }])
      ) // enrollments for student
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // lessons for enrollment
      .mockResolvedValueOnce(queryResult([])); // payments for enrollment

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: dob });

    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].wasMinorAtCompletion).toBe(true);
  });

  it('is false for a student who was already an adult AS OF completion', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    const completedAt = new Date();
    const dob = new Date(completedAt);
    dob.setFullYear(dob.getFullYear() - 25); // adult at completion

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_training',
          status: 'completed',
          hours_required: 6,
          completed: true,
          completed_at: completedAt.toISOString(),
          completion_reason: null,
          track_override: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: dob });

    expect(enrollments[0].wasMinorAtCompletion).toBe(false);
  });

  it('is false for a not-yet-completed enrollment, regardless of age', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 16); // currently a minor

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
          completed_at: null,
          completion_reason: null,
          track_override: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: dob });

    expect(enrollments[0].wasMinorAtCompletion).toBe(false);
  });
});

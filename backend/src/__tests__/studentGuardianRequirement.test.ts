import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';

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
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString(), hours_required: 6, completed: false }])
      ) // student row
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings - resolved before lessons
      .mockResolvedValueOnce(queryResult([])) // batched lessons
      .mockResolvedValueOnce(queryResult([])); // batched guardian counts - none linked

    const student = await studentService.getStudentById(STUDENT_ID, TENANT_ID);
    expect(student?.needsGuardian).toBe(true);
  });

  it('a minor with one linked guardian has needsGuardian=false', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString(), hours_required: 6, completed: false }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ student_id: STUDENT_ID, count: '1' }]));

    const student = await studentService.getStudentById(STUDENT_ID, TENANT_ID);
    expect(student?.needsGuardian).toBe(false);
  });

  it('an adult always has needsGuardian=false, and the guardian-count query is never issued', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString(), hours_required: 6, completed: false }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])); // batched lessons - no third call for guardian counts

    const student = await studentService.getStudentById(STUDENT_ID, TENANT_ID);
    expect(student?.needsGuardian).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('getAllStudents batches the guardian-count query once across multiple minors, not N+1', async () => {
    const studentService = await import('../services/studentService');
    const STUDENT_ID_2 = '55555555-5555-5555-5555-555555555555';

    mockQuery
      .mockResolvedValueOnce(queryResult([{ count: '2' }])) // total count
      .mockResolvedValueOnce(
        queryResult([
          { id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString(), hours_required: 6, completed: false },
          { id: STUDENT_ID_2, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString(), hours_required: 6, completed: false },
        ])
      ) // student rows
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // batched lessons
      .mockResolvedValueOnce(queryResult([{ student_id: STUDENT_ID, count: '1' }])); // batched guardian counts - one call for both

    const { students } = await studentService.getAllStudents(TENANT_ID, 1, 50);
    expect(mockQuery).toHaveBeenCalledTimes(5);
    expect(students.find(s => s.id === STUDENT_ID)?.needsGuardian).toBe(false);
    expect(students.find(s => s.id === STUDENT_ID_2)?.needsGuardian).toBe(true);
  });

  it('markStudentCompleted rejects a minor with needsGuardian=true', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString(), hours_required: 6, completed: false }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // lessons
      .mockResolvedValueOnce(queryResult([])); // no guardians linked

    await expect(
      studentService.markStudentCompleted(STUDENT_ID, TENANT_ID, {}, 'staff-1')
    ).rejects.toThrow('no linked guardian');
  });

  it('markStudentCompleted succeeds for a minor once a guardian is linked', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: minorDob.toISOString(), hours_required: 6, completed: false }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // lessons
      .mockResolvedValueOnce(queryResult([{ student_id: STUDENT_ID, count: '1' }])) // guardian linked
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, completed: true, status: 'completed' }])
      ); // the UPDATE

    await expect(
      studentService.markStudentCompleted(STUDENT_ID, TENANT_ID, {}, 'staff-1')
    ).resolves.toMatchObject({ completed: true });
  });

  it('markStudentCompleted succeeds for an adult with zero guardians', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString(), hours_required: 6, completed: false }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // lessons - no guardian-count call for an adult
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, completed: true, status: 'completed' }])
      ); // the UPDATE

    await expect(
      studentService.markStudentCompleted(STUDENT_ID, TENANT_ID, {}, 'staff-1')
    ).resolves.toMatchObject({ completed: true });
  });
});

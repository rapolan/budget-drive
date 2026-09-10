import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-3';
const ADULT_DOB = '2000-01-01';

/**
 * Regression coverage (bug found via a full codebase health audit):
 * studentService.updateStudent's dynamic UPDATE column builder enumerated
 * 30 other Student fields but never included date_of_birth, even though it
 * was already read (via data.dateOfBirth) for the adult-email-required
 * pre-check a few lines below in the same function. Editing a student's
 * date of birth through the UI (StudentModal.tsx renders it as a plain,
 * non-disabled input in edit mode) silently no-op'd - the save succeeded
 * with no error, but the column never changed. Fixed by adding the missing
 * fields.push('date_of_birth = $...') branch, matching every other field's
 * pattern in the same builder.
 */
describe('studentService.updateStudent - date_of_birth (bug: field silently dropped)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes date_of_birth in the UPDATE when dateOfBirth is provided', async () => {
    const { updateStudent } = await import('../services/studentService');

    const newDob = new Date('1999-06-15T00:00:00.000Z');

    // dateOfBirth !== undefined triggers updateStudent's own adult-email
    // pre-check, which re-fetches the current row via getStudentById first.
    // Sequence matches the equivalent adult-path pre-check already proven
    // out in studentEmailOptional.test.ts's "updating an adult student
    // email to empty is rejected" test: 1. student row (getStudentById)
    // 2. tenant settings (age calc) 3. outstanding fees 4. enrollments for
    // student (empty - skips the deeper lesson/payment queries) 5. tenant
    // settings again (updateStudent's own age-check lookup) 6. the actual
    // UPDATE.
    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: ADULT_DOB, email: 'adult@example.com' }])
      ) // getStudentById's own SELECT
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // getTenantSettings (age calc)
      .mockResolvedValueOnce(queryResult([])) // outstanding fees
      .mockResolvedValueOnce(queryResult([])) // enrollments for student - none
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // updateStudent's own age-check tenant-settings lookup
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: newDob.toISOString(), email: 'adult@example.com' }])
      ); // the UPDATE itself

    const result = await updateStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: newDob });

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/date_of_birth\s*=\s*\$\d+/);
    expect(params).toContain(newDob);

    expect(result.dateOfBirth).toBeTruthy();
    expect(new Date(result.dateOfBirth as unknown as string).toISOString()).toBe(newDob.toISOString());
  });
});

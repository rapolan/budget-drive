import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';

/**
 * Online DE has no cohort - this is its completion home, the Online tab
 * on the Classroom page (item 3 of the DE-lifecycle-edges investigation).
 * Structurally parallel to certificateService.getAwaitingCertificateWorklist -
 * a plain SELECT scoped to not-yet-completed online driver_education
 * enrollments, tenant-wide.
 */
describe('classroomService.getOnlineDeInProgress', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('lists a not-yet-completed online DE enrollment with its manual hours', async () => {
    const { getOnlineDeInProgress } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          enrollment_id: 'enr-1',
          student_id: 'stu-1',
          student_name: 'Jamie Online',
          manual_completed_hours: '12.50',
          hours_required: '30.00',
        },
      ])
    );

    const entries = await getOnlineDeInProgress(TENANT_ID);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      enrollmentId: 'enr-1',
      studentId: 'stu-1',
      studentName: 'Jamie Online',
      manualCompletedHours: 12.5,
      hoursRequired: 30,
    });
  });

  it('coerces a null manualCompletedHours to null, not 0 or NaN', async () => {
    const { getOnlineDeInProgress } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          enrollment_id: 'enr-2',
          student_id: 'stu-2',
          student_name: 'No Hours Yet',
          manual_completed_hours: null,
          hours_required: '30.00',
        },
      ])
    );

    const entries = await getOnlineDeInProgress(TENANT_ID);

    expect(entries[0].manualCompletedHours).toBeNull();
  });

  it('scopes the query to tenant_id, program_type, delivery mode, and not-completed', async () => {
    const { getOnlineDeInProgress } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await getOnlineDeInProgress(TENANT_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/tenant_id = \$1/);
    expect(sql).toMatch(/program_type = 'driver_education'/);
    expect(sql).toMatch(/de_delivery_mode = 'online'/);
    expect(sql).toMatch(/completed = false/);
    expect(params[0]).toBe(TENANT_ID);
  });
});

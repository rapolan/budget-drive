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

/**
 * The read-only browse/history counterpart to getOnlineDeInProgress
 * (item 4) - Classroom page's Online tab "Completed" section. Same shape,
 * opposite completed filter, plus completedAt for newest-first ordering.
 */
describe('classroomService.getOnlineDeCompleted', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('lists a completed online DE enrollment with its logged hours and completion date', async () => {
    const { getOnlineDeCompleted } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          enrollment_id: 'enr-3',
          student_id: 'stu-3',
          student_name: 'Done Online',
          manual_completed_hours: '30.00',
          completed_at: '2026-08-01T00:00:00.000Z',
        },
      ])
    );

    const entries = await getOnlineDeCompleted(TENANT_ID);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      enrollmentId: 'enr-3',
      studentId: 'stu-3',
      studentName: 'Done Online',
      manualCompletedHours: 30,
      completedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('coerces a null completedAt to null rather than throwing', async () => {
    const { getOnlineDeCompleted } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          enrollment_id: 'enr-4',
          student_id: 'stu-4',
          student_name: 'No Timestamp',
          manual_completed_hours: '10.00',
          completed_at: null,
        },
      ])
    );

    const entries = await getOnlineDeCompleted(TENANT_ID);

    expect(entries[0].completedAt).toBeNull();
  });

  it('scopes the query to tenant_id, program_type, delivery mode, completed=true, ordered newest-first', async () => {
    const { getOnlineDeCompleted } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await getOnlineDeCompleted(TENANT_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/tenant_id = \$1/);
    expect(sql).toMatch(/program_type = 'driver_education'/);
    expect(sql).toMatch(/de_delivery_mode = 'online'/);
    expect(sql).toMatch(/completed = true/);
    expect(sql).toMatch(/ORDER BY e\.completed_at DESC/);
    expect(params[0]).toBe(TENANT_ID);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const TENANT_ID = 'tenant-abc';
const ENROLLMENT_ID = 'enrollment-1';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';

/**
 * completeAndIssueDeCertificate is classroom DE's "immediate issuance"
 * combined action - marks the enrollment complete (requires 4/4
 * curriculum-day attendance) AND records the certificate, atomically. A
 * failure at either write must never leave a completed-but-uncertified
 * enrollment or a certificate against a still-incomplete one.
 */
describe('enrollmentService.completeAndIssueDeCertificate', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  function classroomEnrollmentRow(overrides: Record<string, unknown> = {}) {
    return {
      id: ENROLLMENT_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      program_type: 'driver_education',
      de_delivery_mode: 'classroom',
      status: 'active',
      hours_required: 30,
      completed: false,
      manual_completed_hours: null,
      assigned_instructor_id: null,
      ...overrides,
    };
  }

  it('rejects an unknown enrollment (404) before ever opening a transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getEnrollmentById - not found

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a non-classroom-DE enrollment (e.g. driver_training) before ever opening a transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, program_type: 'driver_training', de_delivery_mode: null, completed: false }])
    );

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects an already-completed enrollment before ever opening a transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(queryResult([classroomEnrollmentRow({ completed: true })]));

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects when fewer than 4 curriculum days are attended, before ever opening a transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([classroomEnrollmentRow()])) // getEnrollmentById
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
        ])
      ); // getClassroomAttendanceSummary - only 2/4

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a minor with no linked guardian, before ever opening a transaction - same gate markEnrollmentCompleted enforces', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 16);

    mockQuery
      .mockResolvedValueOnce(queryResult([classroomEnrollmentRow()])) // getEnrollmentById
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 4 },
        ])
      ) // getClassroomAttendanceSummary - 4/4
      .mockResolvedValueOnce(queryResult([{ date_of_birth: dob.toISOString(), guardian_count: '0' }])) // guardian check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])); // getTenantSettings

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a serial number already in use, before ever opening a transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([classroomEnrollmentRow()]))
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 4 },
        ])
      )
      .mockResolvedValueOnce(queryResult([{ date_of_birth: '2000-01-01', guardian_count: '1' }])) // guardian check (adult, doesn't matter)
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'existing-cert' }])); // serial already in use

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS-DUPE', issueDate: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('completes the enrollment and records a DL_400B certificate atomically in one transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([classroomEnrollmentRow()])) // getEnrollmentById
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 4 },
        ])
      ) // getClassroomAttendanceSummary - 4/4
      .mockResolvedValueOnce(queryResult([{ date_of_birth: '2000-01-01', guardian_count: '0' }])) // guardian check (adult)
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // serial not in use
      .mockResolvedValueOnce(queryResult([{ teacher_instructor_id: INSTRUCTOR_ID }])); // cohort teacher default

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(
        queryResult([{ ...classroomEnrollmentRow({ completed: true }), completed_at: '2026-08-15T00:00:00.000Z' }])
      ) // UPDATE enrollments
      .mockResolvedValueOnce(
        queryResult([{
          id: 'cert-de-1',
          tenant_id: TENANT_ID,
          enrollment_id: ENROLLMENT_ID,
          serial_number: 'CS-DE-1',
          form_type: 'DL_400B',
          issue_date: '2026-08-15',
          status: 'issued',
          issued_by_instructor_id: INSTRUCTOR_ID,
          recorded_by: 'user-1',
          completion_hash: 'abc123',
        }])
      ) // INSERT certificates
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const result = await completeAndIssueDeCertificate(
      ENROLLMENT_ID,
      TENANT_ID,
      { serialNumber: 'CS-DE-1', issueDate: '2026-08-15' },
      'user-1'
    );

    expect(result.enrollment.completed).toBe(true);
    expect(result.certificate.formType).toBe('DL_400B');
    expect(result.certificate.issuedByInstructorId).toBe(INSTRUCTOR_ID);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/UPDATE enrollments/);
    expect(clientCalls[1]).toMatch(/completed = true/);
    expect(clientCalls[2]).toMatch(/INSERT INTO certificates/);
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
  });

  it('rolls back both writes - no partial state - when the certificate INSERT fails mid-transaction', async () => {
    const { completeAndIssueDeCertificate } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([classroomEnrollmentRow()]))
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 4 },
        ])
      )
      .mockResolvedValueOnce(queryResult([{ date_of_birth: '2000-01-01', guardian_count: '0' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // serial not in use
      .mockResolvedValueOnce(queryResult([{ teacher_instructor_id: INSTRUCTOR_ID }]));

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(
        queryResult([{ ...classroomEnrollmentRow({ completed: true }), completed_at: '2026-08-15T00:00:00.000Z' }])
      ) // UPDATE enrollments succeeds
      .mockRejectedValueOnce(new Error('unique_violation')) // INSERT certificates fails
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      completeAndIssueDeCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS-DE-1', issueDate: '2026-08-15' }, 'user-1')
    ).rejects.toThrow('unique_violation');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[clientCalls.length - 1]).toBe('ROLLBACK');
    // No COMMIT anywhere - the enrollment-completion UPDATE that already
    // ran must not be left committed on its own (no completed-but-
    // uncertified partial state).
    expect(clientCalls).not.toContain('COMMIT');
  });
});

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
const STUDENT_ID = 'student-1';
const NEW_ENROLLMENT_ID = 'enrollment-new';

/**
 * enrollInBtw is the directional DE -> BTW action (see
 * docs/ARCHITECTURE.md's Students-page section) - up to three writes
 * (enrollment, optional permit, optional external-DE-completion stamp)
 * that must be all-or-nothing in one transaction, modeled on
 * classroomService.joinCohort's BEGIN/COMMIT shape.
 */
describe('enrollmentService.enrollInBtw', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('rejects an unknown student (404) before ever opening a transaction', async () => {
    const { enrollInBtw } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // student not found

    await expect(enrollInBtw(STUDENT_ID, TENANT_ID, {})).rejects.toMatchObject({ statusCode: 404 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a student who already has an active driver_training enrollment, before ever opening a transaction', async () => {
    const { enrollInBtw } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([{ id: 'existing-enrollment', status: 'active' }])); // getActiveDriverTrainingEnrollment

    await expect(enrollInBtw(STUDENT_ID, TENANT_ID, {})).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('creates the enrollment only, with no permit or external-DE writes, when neither is provided', async () => {
    const { enrollInBtw } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // no active driver_training enrollment
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, default_hours_required: 6 }])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(
        queryResult([{
          id: NEW_ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
        }])
      ) // enrollment insert
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID }])) // student re-select
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const result = await enrollInBtw(STUDENT_ID, TENANT_ID, {});

    expect(result.enrollment.id).toBe(NEW_ENROLLMENT_ID);
    expect(result.student.id).toBe(STUDENT_ID);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls).toHaveLength(4); // BEGIN, enrollment insert, student re-select, COMMIT - no permit/external-DE UPDATE
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
  });

  it('writes all three - permit, enrollment, and external-DE-completion - atomically in one transaction', async () => {
    const { enrollInBtw } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // no active driver_training enrollment
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, default_hours_required: 6 }])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // permit UPDATE
      .mockResolvedValueOnce(
        queryResult([{
          id: NEW_ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
        }])
      ) // enrollment insert
      .mockResolvedValueOnce(queryResult([])) // external-DE UPDATE
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, learner_permit_number: 'X123' }])
      ) // student re-select
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const result = await enrollInBtw(STUDENT_ID, TENANT_ID, {
      permit: { number: 'X123', issueDate: new Date('2026-01-01'), expiration: new Date('2030-01-01') },
      externalDeCompleted: { date: new Date('2025-06-01'), provider: 'Some Other School' },
    });

    expect(result.enrollment.id).toBe(NEW_ENROLLMENT_ID);
    expect(result.student.learnerPermitNumber).toBe('X123');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/UPDATE students SET/);
    expect(clientCalls[2]).toMatch(/INSERT INTO enrollments/);
    expect(clientCalls[3]).toMatch(/UPDATE enrollments[\s\S]*external_de_completed/);
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
  });

  it('rolls back all writes - no partial state - when the enrollment insert fails mid-transaction', async () => {
    const { enrollInBtw } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // no active driver_training enrollment
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, default_hours_required: 6 }])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // permit UPDATE succeeds
      .mockRejectedValueOnce(new Error('unique_violation')) // enrollment insert fails
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      enrollInBtw(STUDENT_ID, TENANT_ID, { permit: { number: 'X123' } })
    ).rejects.toThrow('unique_violation');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[clientCalls.length - 1]).toBe('ROLLBACK');
    // No COMMIT anywhere in the call list - the permit UPDATE that already
    // ran must not be left committed on its own.
    expect(clientCalls).not.toContain('COMMIT');
    expect(mockClientQuery).toHaveBeenCalledTimes(4);
  });

  it('rolls back all writes when the external-DE-completion update fails mid-transaction', async () => {
    const { enrollInBtw } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // no active driver_training enrollment
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, default_hours_required: 6 }])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(
        queryResult([{
          id: NEW_ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
        }])
      ) // enrollment insert succeeds
      .mockRejectedValueOnce(new Error('connection lost')) // external-DE UPDATE fails
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      enrollInBtw(STUDENT_ID, TENANT_ID, { externalDeCompleted: { provider: 'Some Other School' } })
    ).rejects.toThrow('connection lost');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[clientCalls.length - 1]).toBe('ROLLBACK');
    expect(clientCalls).not.toContain('COMMIT');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult, mockClientQuery, mockGetClient, resetMockClient } from './mocks/database';
import { AppError } from '../middleware/errorHandler';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: unknown[]) => mockValidateLessonBooking(...args),
}));

vi.mock('../services/Ledger', () => ({
  ledger: { anchorAction: vi.fn(), recordTreasurySplit: vi.fn() },
}));

vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const mockCheckBookingEligibilityLocked = vi.fn();
vi.mock('../services/bookingEligibilityService', () => ({
  checkBookingEligibilityLocked: (...args: unknown[]) => mockCheckBookingEligibilityLocked(...args),
}));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';
const VEHICLE_ID = 'vehicle-1';
const ENROLLMENT_ID = 'enrollment-1';

function mockThroughToTransaction(requirePaymentBeforeBooking: boolean) {
  mockQuery
    .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
    .mockResolvedValueOnce(
      queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
    ) // active driver_training enrollment
    .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
    .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings (timezone)
    .mockResolvedValueOnce(queryResult([{ id: VEHICLE_ID }])) // explicit vehicle check
    .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation
    .mockResolvedValueOnce(queryResult([{ de_discount_amount: null, require_payment_before_booking: requirePaymentBeforeBooking }])); // getTenantSettings (discount + the new flag)
  mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });
}

const BASE_PAYLOAD = {
  studentId: STUDENT_ID,
  instructorId: INSTRUCTOR_ID,
  vehicleId: VEHICLE_ID,
  date: '2026-08-03',
  startTime: '10:00:00',
  endTime: '12:00:00',
  duration: 120,
  cost: 80,
};

describe('lessonService.createLesson - payment-before-booking integration', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
    mockValidateLessonBooking.mockReset();
    mockCheckBookingEligibilityLocked.mockReset();
  });

  it('setting OFF: checkBookingEligibilityLocked is never called, lesson created normally', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToTransaction(false);

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '80.00', status: 'scheduled' }])) // INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const lesson = await createLesson(TENANT_ID, BASE_PAYLOAD);

    expect(lesson.id).toBe('lesson-1');
    expect(mockCheckBookingEligibilityLocked).not.toHaveBeenCalled();
  });

  it('setting ON, eligibility allowed: lesson created normally, checked with (client, tenantId, enrollmentId, finalCost)', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToTransaction(true);
    mockCheckBookingEligibilityLocked.mockResolvedValueOnce({ allowed: true, hasPaymentArrangement: false });

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '80.00', status: 'scheduled' }])) // INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const lesson = await createLesson(TENANT_ID, BASE_PAYLOAD);

    expect(lesson.id).toBe('lesson-1');
    expect(mockCheckBookingEligibilityLocked).toHaveBeenCalledTimes(1);
    const [client, tenantId, enrollmentId, finalCost] = mockCheckBookingEligibilityLocked.mock.calls[0];
    expect(tenantId).toBe(TENANT_ID);
    expect(enrollmentId).toBe(ENROLLMENT_ID);
    expect(finalCost).toBe(80); // no DE discount in this fixture, so finalCost === requested cost
    // The SAME client used for BEGIN/the insert/COMMIT - not a different
    // connection (the whole point of the row lock).
    expect(client.query).toBe(mockClientQuery);
  });

  it('setting ON, eligibility blocked: rejects with 409 AppError code PAYMENT_REQUIRED, rolls back, releases the client', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToTransaction(true);
    mockCheckBookingEligibilityLocked.mockResolvedValueOnce({ allowed: false, hasPaymentArrangement: false });

    mockClientQuery.mockResolvedValueOnce(queryResult([])); // BEGIN (then the throw happens before INSERT)
    mockClientQuery.mockResolvedValueOnce(queryResult([])); // ROLLBACK

    let caught: unknown;
    try {
      await createLesson(TENANT_ID, BASE_PAYLOAD);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(409);
    expect((caught as AppError).code).toBe('PAYMENT_REQUIRED');

    const calledSqlStrings = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(calledSqlStrings).toContain('BEGIN');
    expect(calledSqlStrings).toContain('ROLLBACK');
    expect(calledSqlStrings).not.toContain('COMMIT');

    const { mockClientRelease } = await import('./mocks/database');
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  it('updateLesson (reschedule/editing an existing lesson) never calls checkBookingEligibilityLocked - structurally separate from createLesson', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: 'lesson-1',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          status: 'scheduled',
          notes: 'old notes',
        }])
      ) // existing lesson lookup
      .mockResolvedValueOnce(
        queryResult([{
          id: 'lesson-1',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          status: 'scheduled',
          notes: 'new notes',
        }])
      ); // UPDATE ... RETURNING (notes-only, no schedule fields touched)

    await updateLesson('lesson-1', TENANT_ID, { notes: 'new notes' });

    expect(mockCheckBookingEligibilityLocked).not.toHaveBeenCalled();
  });

  it('concurrency mechanism: one getClient() call per createLesson, BEGIN/lock/insert/COMMIT all on the same client, never on the module-level query', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToTransaction(true);
    mockCheckBookingEligibilityLocked.mockImplementation(async (client) => {
      // Exercise the lock query on the SAME client the test provides,
      // mirroring what checkBookingEligibilityLocked actually does
      // internally (mocked here since the module itself is mocked).
      await client.query('SELECT 1 FOR UPDATE');
      return { allowed: true, hasPaymentArrangement: false };
    });

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // the lock query run inside the mocked checkBookingEligibilityLocked
      .mockResolvedValueOnce(queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '80.00', status: 'scheduled' }])) // INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    await createLesson(TENANT_ID, BASE_PAYLOAD);

    expect(mockGetClient).toHaveBeenCalledTimes(1);
    const sqlCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(sqlCalls[0]).toBe('BEGIN');
    expect(sqlCalls[sqlCalls.length - 1]).toBe('COMMIT');
    expect(sqlCalls.some((sql) => typeof sql === 'string' && sql.includes('FOR UPDATE'))).toBe(true);

    // None of BEGIN/the lock/the INSERT/COMMIT ever touch the module-level
    // query - this proves the lock and the insert that follows it are on
    // the SAME transaction/connection, which is what actually makes the
    // lock serialize a second concurrent booking against this enrollment.
    // (Post-insert side effects - treasury split, notification emails,
    // calendar sync - DO use the module-level query, same as before this
    // feature; this assertion is scoped to the transaction's own 4 calls,
    // not a total count, since the unrelated post-insert plumbing's own
    // call count isn't this test's concern.) A true two-connections-racing
    // test belongs in the real-DB integration test
    // (bookingEligibilityConcurrency.integration.test.ts) - this test only
    // proves the MECHANISM (one transaction, one client, lock before
    // insert), not an observed race.
    const moduleLevelSqlStrings = mockQuery.mock.calls.map(([sql]) => sql);
    expect(moduleLevelSqlStrings).not.toContain('BEGIN');
    expect(moduleLevelSqlStrings).not.toContain('COMMIT');
    expect(moduleLevelSqlStrings.some((sql) => typeof sql === 'string' && sql.includes('FOR UPDATE'))).toBe(false);
    expect(moduleLevelSqlStrings.some((sql) => typeof sql === 'string' && sql.includes('INSERT INTO lessons'))).toBe(false);
  });
});

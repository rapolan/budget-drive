import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockQuery, resetMockQuery, queryResult, mockGetClient, mockClientQuery, mockClientRelease, resetMockClient } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

vi.mock('../services/treasuryService', () => ({
  default: { createTransaction: vi.fn() },
}));
vi.mock('../services/Ledger', () => ({
  ledger: { anchorAction: vi.fn(), recordPayment: vi.fn() },
}));
vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const LESSON_ID = 'lesson-1';
const USER_ID = 'user-admin-1';

function feeFlagRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'flag-1',
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    enrollment_id: ENROLLMENT_ID,
    lesson_id: LESSON_ID,
    amount: '50.00',
    reason: 'No-show',
    status: 'outstanding',
    waived_by: null,
    waived_reason: null,
    waived_at: null,
    paid_payment_id: null,
    paid_at: null,
    created_at: new Date('2026-08-10'),
    updated_at: new Date('2026-08-10'),
    ...overrides,
  };
}

describe('feeFlagService', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('createFeeFlag inserts an outstanding flag with amount/reason/source lesson', async () => {
    const { createFeeFlag } = await import('../services/feeFlagService');

    mockQuery.mockResolvedValueOnce(queryResult([feeFlagRow()]));

    const flag = await createFeeFlag(TENANT_ID, STUDENT_ID, ENROLLMENT_ID, LESSON_ID, 50, 'No-show');

    expect(flag.status).toBe('outstanding');
    expect(flag.amount).toBe('50.00');
    expect(flag.reason).toBe('No-show');
    expect(flag.lessonId).toBe(LESSON_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO fee_flags/);
    expect(params).toEqual([TENANT_ID, STUDENT_ID, ENROLLMENT_ID, LESSON_ID, 50, 'No-show']);
  });

  it('getOutstandingFlagsForStudent returns only outstanding flags, oldest first', async () => {
    const { getOutstandingFlagsForStudent } = await import('../services/feeFlagService');

    mockQuery.mockResolvedValueOnce(queryResult([feeFlagRow()]));

    const flags = await getOutstandingFlagsForStudent(TENANT_ID, STUDENT_ID);

    expect(flags).toHaveLength(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'outstanding'/);
    expect(sql).toMatch(/ORDER BY created_at ASC/);
  });

  it('waiveFeeFlag records who and why, and moves status to waived', async () => {
    const { waiveFeeFlag } = await import('../services/feeFlagService');

    mockQuery.mockResolvedValueOnce(
      queryResult([feeFlagRow({ status: 'waived', waived_by: USER_ID, waived_reason: 'Family emergency', waived_at: new Date() })])
    );

    const flag = await waiveFeeFlag('flag-1', TENANT_ID, USER_ID, 'Family emergency');

    expect(flag.status).toBe('waived');
    expect(flag.waivedBy).toBe(USER_ID);
    expect(flag.waivedReason).toBe('Family emergency');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'waived'/);
    expect(params).toEqual([USER_ID, 'Family emergency', 'flag-1', TENANT_ID]);
  });

  it('waiveFeeFlag throws 404 when no outstanding flag matches', async () => {
    const { waiveFeeFlag } = await import('../services/feeFlagService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(waiveFeeFlag('flag-1', TENANT_ID, USER_ID, 'reason')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('clearOutstandingFlagsForStudent clears every outstanding flag, not just one', async () => {
    const { clearOutstandingFlagsForStudent } = await import('../services/feeFlagService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await clearOutstandingFlagsForStudent(TENANT_ID, STUDENT_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SET status = 'cleared'/);
    expect(sql).toMatch(/WHERE tenant_id = \$1 AND student_id = \$2 AND status = 'outstanding'/);
    expect(params).toEqual([TENANT_ID, STUDENT_ID]);
  });

  describe('recordPaymentForFeeFlag - Constraint A payee gating', () => {
    it('throws 403 and creates no payment when payee is instructor', async () => {
      const { recordPaymentForFeeFlag } = await import('../services/feeFlagService');

      mockQuery.mockResolvedValueOnce(
        queryResult([{ tenant_id: TENANT_ID, cancellation_fee_payee: 'instructor' }])
      ); // getTenantSettings

      await expect(recordPaymentForFeeFlag('flag-1', TENANT_ID, USER_ID)).rejects.toMatchObject({
        statusCode: 403,
      });

      // Only the settings read happened - no payment INSERT was ever issued.
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('creates exactly one payment and marks the flag paid when payee is school', async () => {
      const { recordPaymentForFeeFlag } = await import('../services/feeFlagService');

      mockQuery
        .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, cancellation_fee_payee: 'school' }])) // getTenantSettings
        .mockResolvedValueOnce(queryResult([feeFlagRow()])) // outstanding flag lookup
        .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // paymentService.createPayment's student check
        .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // paymentService.createPayment's active driver_training enrollment lookup
        .mockResolvedValueOnce(queryResult([{ id: LESSON_ID }])) // paymentService.createPayment's lesson check
        .mockResolvedValueOnce(
          queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, student_id: STUDENT_ID, amount: 50, payment_type: 'cancellation_fee', status: 'confirmed' }])
        ) // INSERT INTO payments
        .mockResolvedValueOnce(queryResult([feeFlagRow({ status: 'paid', paid_payment_id: 'payment-1', paid_at: new Date() })])); // UPDATE fee_flags

      const flag = await recordPaymentForFeeFlag('flag-1', TENANT_ID, USER_ID);

      expect(flag.status).toBe('paid');
      expect(flag.paidPaymentId).toBe('payment-1');

      const paymentInsertCall = mockQuery.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO payments')
      );
      expect(paymentInsertCall).toBeDefined();
    });
  });

  describe('markStudentFeesPaid - one-click "Paid" for all of a student\'s outstanding fees', () => {
    it('instructor payee: clears every outstanding flag, creates no payment records, all in one transaction', async () => {
      const { markStudentFeesPaid } = await import('../services/feeFlagService');

      // getTenantSettings is a plain read that always goes through the
      // module-level query, never the transactional client.
      mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, cancellation_fee_payee: 'instructor' }]));

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockResolvedValueOnce(
          queryResult([feeFlagRow({ id: 'flag-1' }), feeFlagRow({ id: 'flag-2' })])
        ) // outstanding flags for student
        .mockResolvedValueOnce(queryResult([feeFlagRow({ id: 'flag-1', status: 'cleared' })])) // clear flag-1
        .mockResolvedValueOnce(queryResult([feeFlagRow({ id: 'flag-2', status: 'cleared' })])) // clear flag-2
        .mockResolvedValueOnce(queryResult([])); // COMMIT

      const flags = await markStudentFeesPaid(TENANT_ID, STUDENT_ID, USER_ID);

      expect(flags).toHaveLength(2);
      expect(flags.every(f => f.status === 'cleared')).toBe(true);
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockClientRelease).toHaveBeenCalledTimes(1);

      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
      expect(clientCalls[0]).toBe('BEGIN');
      expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
      // No payment INSERT anywhere in this transaction - instructor-payee
      // fees never create a payment record.
      expect(clientCalls.some(sql => typeof sql === 'string' && sql.includes('INSERT INTO payments'))).toBe(false);
    });

    it('school payee: creates a real payment per flag (mirrors recordPaymentForFeeFlag exactly), all in one transaction', async () => {
      const { markStudentFeesPaid } = await import('../services/feeFlagService');

      // Both getTenantSettings (called once by markStudentFeesPaid itself,
      // and again inside recordPaymentForFeeFlag's own payee re-check) and
      // getActiveDriverTrainingEnrollment (inside paymentService.createPayment)
      // are plain reads that always go through the module-level query,
      // never the transactional client - only the writes are passed dbQuery.
      mockQuery
        .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, cancellation_fee_payee: 'school' }])) // getTenantSettings (markStudentFeesPaid)
        .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, cancellation_fee_payee: 'school' }])) // getTenantSettings (recordPaymentForFeeFlag's own re-check)
        .mockResolvedValueOnce(
          queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
        ); // createPayment's active driver_training enrollment lookup

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockResolvedValueOnce(queryResult([feeFlagRow({ id: 'flag-1' })])) // outstanding flags for student (one flag)
        // recordPaymentForFeeFlag('flag-1', ...) internals, all on the same client:
        .mockResolvedValueOnce(queryResult([feeFlagRow({ id: 'flag-1' })])) // outstanding flag lookup
        .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // createPayment's student check
        .mockResolvedValueOnce(queryResult([{ id: LESSON_ID }])) // createPayment's lesson check
        .mockResolvedValueOnce(
          queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, student_id: STUDENT_ID, amount: 50, payment_type: 'cancellation_fee', status: 'confirmed' }])
        ) // INSERT INTO payments
        .mockResolvedValueOnce(queryResult([feeFlagRow({ id: 'flag-1', status: 'paid', paid_payment_id: 'payment-1' })])) // UPDATE fee_flags -> paid
        .mockResolvedValueOnce(queryResult([])); // COMMIT

      const flags = await markStudentFeesPaid(TENANT_ID, STUDENT_ID, USER_ID);

      expect(flags).toHaveLength(1);
      expect(flags[0].status).toBe('paid');
      expect(flags[0].paidPaymentId).toBe('payment-1');

      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
      expect(clientCalls[0]).toBe('BEGIN');
      expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
      expect(clientCalls.some(sql => typeof sql === 'string' && sql.includes('INSERT INTO payments'))).toBe(true);
    });

    it('rolls back the whole transaction and creates nothing if one flag in the batch fails', async () => {
      const { markStudentFeesPaid } = await import('../services/feeFlagService');

      mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, cancellation_fee_payee: 'instructor' }])); // getTenantSettings

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockResolvedValueOnce(
          queryResult([feeFlagRow({ id: 'flag-1' }), feeFlagRow({ id: 'flag-2' })])
        ) // outstanding flags for student
        .mockResolvedValueOnce(queryResult([feeFlagRow({ id: 'flag-1', status: 'cleared' })])) // clear flag-1 succeeds
        .mockRejectedValueOnce(new Error('connection lost')) // clear flag-2 fails
        .mockResolvedValueOnce(queryResult([])); // ROLLBACK

      await expect(markStudentFeesPaid(TENANT_ID, STUDENT_ID, USER_ID)).rejects.toThrow('connection lost');

      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
      expect(clientCalls).toContain('ROLLBACK');
      expect(clientCalls).not.toContain('COMMIT');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array and rolls back cleanly when the student has no outstanding fees', async () => {
      const { markStudentFeesPaid } = await import('../services/feeFlagService');

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockResolvedValueOnce(queryResult([])) // outstanding flags for student - none
        .mockResolvedValueOnce(queryResult([])); // ROLLBACK

      const flags = await markStudentFeesPaid(TENANT_ID, STUDENT_ID, USER_ID);

      expect(flags).toEqual([]);
      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
      expect(clientCalls).toContain('ROLLBACK');
      expect(clientCalls).not.toContain('COMMIT');
    });
  });
});

describe('lessonService fee-flag side effects', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('noShowLesson sets an outstanding fee flag using the tenant cancellation fee amount', async () => {
    const { noShowLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, enrollment_id: ENROLLMENT_ID, status: 'scheduled' }])) // assertLessonReviewable
      .mockResolvedValueOnce(queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, enrollment_id: ENROLLMENT_ID, status: 'no_show' }])) // UPDATE lessons
      .mockResolvedValueOnce(queryResult([{ full_name: 'Jane Doe' }])) // student name lookup for notification
      .mockResolvedValueOnce(queryResult([{ id: 'notif-1' }])) // notification INSERT
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, cancellation_fee_amount: '75.00' }])) // getTenantSettings for fee flag
      .mockResolvedValueOnce(queryResult([feeFlagRow({ amount: '75.00' })])); // fee_flags INSERT

    await noShowLesson(LESSON_ID, TENANT_ID, USER_ID);

    const feeFlagInsertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO fee_flags')
    );
    expect(feeFlagInsertCall).toBeDefined();
    const [, params] = feeFlagInsertCall!;
    expect(params).toEqual([TENANT_ID, STUDENT_ID, ENROLLMENT_ID, LESSON_ID, 75, 'No-show']);
  });

  it('completeLesson clears all outstanding fee flags for the student', async () => {
    const { completeLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'scheduled' }])) // assertLessonReviewable
      .mockResolvedValueOnce(queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'completed' }])) // UPDATE lessons
      .mockResolvedValueOnce(queryResult([])); // fee_flags clear UPDATE

    await completeLesson(LESSON_ID, TENANT_ID, USER_ID);

    const clearCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("SET status = 'cleared'")
    );
    expect(clearCall).toBeDefined();
    const [, params] = clearCall!;
    expect(params).toEqual([TENANT_ID, STUDENT_ID]);
  });

  describe('cancelLesson fee-window check', () => {
    function cancelMockSequence(lessonRow: Record<string, unknown>, settingsRow: Record<string, unknown>) {
      mockQuery
        .mockResolvedValueOnce(queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, enrollment_id: ENROLLMENT_ID, status: 'scheduled' }])) // assertLessonReviewable
        .mockResolvedValueOnce(queryResult([{ enrollment_id: ENROLLMENT_ID, ...lessonRow }])) // UPDATE lessons
        .mockResolvedValueOnce(queryResult([{ email: 'student@example.com' }])) // student email
        .mockResolvedValueOnce(queryResult([{ email: 'instructor@example.com' }])) // instructor email
        .mockResolvedValueOnce(queryResult([])) // notification_queue insert (student)
        .mockResolvedValueOnce(queryResult([])) // notification_queue insert (instructor)
        .mockResolvedValueOnce(queryResult([])) // cancel pending reminders
        .mockResolvedValueOnce(queryResult([settingsRow])); // getTenantSettings for fee-window check
    }

    it('a cancellation inside the fee window sets a flag', async () => {
      const { cancelLesson } = await import('../services/lessonService');

      // Lesson starts 5 hours from now (UTC timezone keeps the math trivial).
      const startInstant = new Date(Date.now() + 5 * 60 * 60 * 1000);
      cancelMockSequence(
        {
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          status: 'cancelled',
          date: startInstant,
          start_time: startInstant.toISOString().slice(11, 19),
        },
        { tenant_id: TENANT_ID, timezone: 'UTC', cancellation_fee_window_hours: 24, cancellation_fee_amount: '50.00' }
      );
      mockQuery.mockResolvedValueOnce(queryResult([feeFlagRow({ reason: 'Late cancellation' })])); // fee_flags INSERT

      await cancelLesson(LESSON_ID, TENANT_ID, USER_ID);

      const feeFlagInsertCall = mockQuery.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO fee_flags')
      );
      expect(feeFlagInsertCall).toBeDefined();
      const [, params] = feeFlagInsertCall!;
      expect(params).toEqual([TENANT_ID, STUDENT_ID, ENROLLMENT_ID, LESSON_ID, 50, 'Late cancellation']);
    });

    it('a cancellation outside the fee window sets no flag', async () => {
      const { cancelLesson } = await import('../services/lessonService');

      // Lesson starts 48 hours from now - outside a 24h window.
      const startInstant = new Date(Date.now() + 48 * 60 * 60 * 1000);
      cancelMockSequence(
        {
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          status: 'cancelled',
          date: startInstant,
          start_time: startInstant.toISOString().slice(11, 19),
        },
        { tenant_id: TENANT_ID, timezone: 'UTC', cancellation_fee_window_hours: 24, cancellation_fee_amount: '50.00' }
      );

      await cancelLesson(LESSON_ID, TENANT_ID, USER_ID);

      const feeFlagInsertCall = mockQuery.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO fee_flags')
      );
      expect(feeFlagInsertCall).toBeUndefined();
    });

    it('a past-lesson (queue correction) cancellation sets no flag', async () => {
      const { cancelLesson } = await import('../services/lessonService');

      // Lesson started 3 hours ago - "hours until start" is negative.
      const startInstant = new Date(Date.now() - 3 * 60 * 60 * 1000);
      cancelMockSequence(
        {
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          status: 'cancelled',
          date: startInstant,
          start_time: startInstant.toISOString().slice(11, 19),
        },
        { tenant_id: TENANT_ID, timezone: 'UTC', cancellation_fee_window_hours: 24, cancellation_fee_amount: '50.00' }
      );

      await cancelLesson(LESSON_ID, TENANT_ID, USER_ID);

      const feeFlagInsertCall = mockQuery.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO fee_flags')
      );
      expect(feeFlagInsertCall).toBeUndefined();
    });
  });
});

describe('Constraint A - fee flags are structurally isolated from revenue', () => {
  it('instructorService.getInstructorEarnings never references fee_flags', () => {
    const source = readFileSync(resolve(__dirname, '../services/instructorService.ts'), 'utf8');
    expect(source).not.toMatch(/fee_flags/);
  });

  it('feeFlagService never writes students.total_paid or students.outstanding_balance', () => {
    const source = readFileSync(resolve(__dirname, '../services/feeFlagService.ts'), 'utf8');
    expect(source).not.toMatch(/total_paid/);
    expect(source).not.toMatch(/outstanding_balance/);
  });
});

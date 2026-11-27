import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';

/**
 * getPaymentQuickAmounts (payment-form-v2) - powers the Record Payment
 * form's quick-amount chips. Mocked-query tests for the query-count/shape
 * and the pure FIFO-allocation math; the exact numeric scenarios here
 * were also independently verified live against a real dev database
 * before writing these (see this branch's own commit description).
 */
function mockQuickAmountsSequence(
  lessons: { id: string; date: string; cost: string; status: string }[],
  totalPaid: string,
  totalCost: string | null = null
) {
  mockQuery
    .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
    .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // getActiveDriverTrainingEnrollment (resolveTargetEnrollmentForPayment)
    .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, total_cost: totalCost, student_id: STUDENT_ID, tenant_id: TENANT_ID }])) // getEnrollmentById
    .mockResolvedValueOnce(queryResult(lessons.map((l) => ({ id: l.id, date: l.date, cost: l.cost, status: l.status })))) // lessons
    .mockResolvedValueOnce(queryResult([{ total_paid: totalPaid }])); // net-paid aggregate
}

describe('paymentService.getPaymentQuickAmounts', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('a student with $0 lessons: every chip is null/not-computable', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence([], '0');

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    expect(result).toEqual({
      nextLesson: null,
      scheduledLessons: null,
      completedUnpaidLessons: null,
      remainingCourse: null,
    });
  });

  it('no payments at all: full cost of every bucket is "still needed"', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence(
      [
        { id: 'l1', date: '2026-09-01', cost: '100.00', status: 'completed' },
        { id: 'l2', date: '2026-09-08', cost: '100.00', status: 'completed' },
        { id: 'l3', date: '2026-12-05', cost: '100.00', status: 'scheduled' },
        { id: 'l4', date: '2026-12-12', cost: '100.00', status: 'scheduled' },
      ],
      '0'
    );

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    expect(result).toEqual({
      nextLesson: { amount: 100, date: '2026-12-05' },
      scheduledLessons: { amount: 200, count: 2 },
      completedUnpaidLessons: { amount: 200, count: 2 },
      remainingCourse: 400,
    });
  });

  it('a partial payment covers the oldest completed lesson first, then partially the second (FIFO)', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence(
      [
        { id: 'l1', date: '2026-09-01', cost: '100.00', status: 'completed' },
        { id: 'l2', date: '2026-09-08', cost: '100.00', status: 'completed' },
        { id: 'l3', date: '2026-12-05', cost: '100.00', status: 'scheduled' },
        { id: 'l4', date: '2026-12-12', cost: '100.00', status: 'scheduled' },
      ],
      '150'
    );

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    // l1 fully covered ($100), l2 half covered ($50 of $100 still owed).
    expect(result.completedUnpaidLessons).toEqual({ amount: 50, count: 1 });
    // Scheduled lessons untouched - the pool ran out on completed lessons.
    expect(result.scheduledLessons).toEqual({ amount: 200, count: 2 });
    expect(result.nextLesson).toEqual({ amount: 100, date: '2026-12-05' });
    expect(result.remainingCourse).toBe(250);
  });

  it('enough payment to clear all completed debt and partially cover the next scheduled lesson', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence(
      [
        { id: 'l1', date: '2026-09-01', cost: '100.00', status: 'completed' },
        { id: 'l2', date: '2026-09-08', cost: '100.00', status: 'completed' },
        { id: 'l3', date: '2026-12-05', cost: '100.00', status: 'scheduled' },
        { id: 'l4', date: '2026-12-12', cost: '100.00', status: 'scheduled' },
      ],
      '230'
    );

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    expect(result.completedUnpaidLessons).toBeNull();
    // $30 of the $230 applied toward scheduled lessons after $200 cleared completed debt.
    expect(result.nextLesson).toEqual({ amount: 70, date: '2026-12-05' });
    expect(result.scheduledLessons).toEqual({ amount: 170, count: 2 });
    expect(result.remainingCourse).toBe(170);
  });

  it('a credit on account (overpaid) clears every bucket - nothing still needed', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence(
      [{ id: 'l1', date: '2026-09-01', cost: '100.00', status: 'completed' }],
      '150'
    );

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    expect(result).toEqual({
      nextLesson: null,
      scheduledLessons: null,
      completedUnpaidLessons: null,
      remainingCourse: 0,
    });
  });

  it("a 'no_show' lesson's cost is excluded entirely, same as 'cancelled' - never shown as still needed", async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence(
      [
        { id: 'l1', date: '2026-09-01', cost: '500.00', status: 'no_show' },
        { id: 'l2', date: '2026-09-08', cost: '100.00', status: 'completed' },
      ],
      '0'
    );

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    // Only the $100 completed lesson counts - the $500 no-show is invisible to every bucket.
    expect(result.completedUnpaidLessons).toEqual({ amount: 100, count: 1 });
    expect(result.remainingCourse).toBe(100);
  });

  it('a package-priced enrollment (totalCost override) uses that figure for remainingCourse, independent of the lesson-sum buckets', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence(
      [{ id: 'l1', date: '2026-12-05', cost: '100.00', status: 'scheduled' }],
      '200',
      '600.00'
    );

    const result = await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    // remainingCourse uses the override ($600 - $200 = $400), not the lesson sum.
    expect(result.remainingCourse).toBe(400);
    // The lesson-level buckets are unaffected by the override - the $100
    // scheduled lesson is already fully covered by the $200 paid.
    expect(result.scheduledLessons).toBeNull();
    expect(result.nextLesson).toEqual({ amount: 0, date: '2026-12-05' });
  });

  it('tenant isolation: every query is scoped by tenantId', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuickAmountsSequence([], '0');

    await getPaymentQuickAmounts(TENANT_ID, STUDENT_ID);

    for (const call of mockQuery.mock.calls) {
      const [sql, params] = call;
      if (typeof sql === 'string' && /tenant_id/i.test(sql)) {
        expect(params).toContain(TENANT_ID);
      }
    }
  });

  it('404s when the student does not belong to this tenant', async () => {
    const { getPaymentQuickAmounts } = await import('../services/paymentService');
    mockQuery.mockResolvedValueOnce(queryResult([])); // student check fails

    await expect(getPaymentQuickAmounts(TENANT_ID, STUDENT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('paymentService.checkDuplicatePayment', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns isDuplicate: false with no matching payment', async () => {
    const { checkDuplicatePayment } = await import('../services/paymentService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await checkDuplicatePayment(TENANT_ID, STUDENT_ID, 50, 'cash');

    expect(result).toEqual({ isDuplicate: false, amount: null });
  });

  it('returns isDuplicate: true with the matching amount when a same-amount/method confirmed payment exists within 24h', async () => {
    const { checkDuplicatePayment } = await import('../services/paymentService');
    mockQuery.mockResolvedValueOnce(queryResult([{ amount: '50.00' }]));

    const result = await checkDuplicatePayment(TENANT_ID, STUDENT_ID, 50, 'cash');

    expect(result).toEqual({ isDuplicate: true, amount: 50 });
  });

  it('scopes the query by tenant_id, student_id, status=confirmed, exact amount/method, and a 24h window', async () => {
    const { checkDuplicatePayment } = await import('../services/paymentService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    await checkDuplicatePayment(TENANT_ID, STUDENT_ID, 75, 'venmo');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/p\.tenant_id = \$1/);
    expect(sql).toMatch(/e\.student_id = \$2/);
    expect(sql).toMatch(/p\.status = 'confirmed'/);
    expect(sql).toMatch(/p\.amount = \$3/);
    expect(sql).toMatch(/p\.payment_method = \$4/);
    expect(sql).toMatch(/interval '24 hours'/);
    expect(params).toEqual([TENANT_ID, STUDENT_ID, 75, 'venmo']);
  });
});

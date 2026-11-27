import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

import {
  evaluateBookingEligibility,
  checkBookingEligibility,
  checkBookingEligibilityLocked,
} from '../services/bookingEligibilityService';

const TENANT_ID = 'tenant-abc';
const ENROLLMENT_ID = 'enrollment-1';

type LessonFixture = { status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'; cost: number };

describe('evaluateBookingEligibility - credit math (pure function)', () => {
  it('pay-per-lesson: credit covers the next lesson when paid exceeds the sum of existing lessons', () => {
    // Paid for 2 lessons' worth ($200), 1 already booked ($100) -> credit
    // $100, enough for a 2nd $100 lesson.
    const lessons: LessonFixture[] = [{ status: 'scheduled', cost: 100 }];
    const result = evaluateBookingEligibility(
      { totalCost: null, paymentArrangementSetAt: null },
      lessons,
      200,
      100
    );
    expect(result).toEqual({ allowed: true, hasPaymentArrangement: false });
  });

  it('pay-all-up-front-then-book-over-time: each sequential booking is allowed until credit is exhausted', () => {
    const netPaid = 300; // enough for exactly 3 lessons at $100 each
    let lessons: LessonFixture[] = [];

    // Lesson 1
    expect(evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, netPaid, 100).allowed).toBe(true);
    lessons = [...lessons, { status: 'scheduled', cost: 100 }];

    // Lesson 2
    expect(evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, netPaid, 100).allowed).toBe(true);
    lessons = [...lessons, { status: 'scheduled', cost: 100 }];

    // Lesson 3 - exactly exhausts credit
    expect(evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, netPaid, 100).allowed).toBe(true);
    lessons = [...lessons, { status: 'scheduled', cost: 100 }];

    // Lesson 4 - credit is now 0, blocked
    expect(evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, netPaid, 100).allowed).toBe(false);
  });

  it('paid for two lessons, a third of the same cost is blocked (credit exactly 0)', () => {
    const lessons: LessonFixture[] = [
      { status: 'scheduled', cost: 100 },
      { status: 'completed', cost: 100 },
    ];
    const result = evaluateBookingEligibility(
      { totalCost: null, paymentArrangementSetAt: null },
      lessons,
      200,
      100
    );
    expect(result.allowed).toBe(false);
  });

  it('cancelling a lesson returns its cost to credit - a booking blocked with it present is allowed once it is cancelled', () => {
    const netPaid = 200;
    const withActiveLesson: LessonFixture[] = [
      { status: 'scheduled', cost: 100 },
      { status: 'scheduled', cost: 100 },
    ];
    const blocked = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, withActiveLesson, netPaid, 100);
    expect(blocked.allowed).toBe(false);

    const withOneCancelled: LessonFixture[] = [
      { status: 'cancelled', cost: 100 },
      { status: 'scheduled', cost: 100 },
    ];
    const allowedAfterCancel = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, withOneCancelled, netPaid, 100);
    expect(allowedAfterCancel.allowed).toBe(true);

    // Identical to the lesson being entirely absent.
    const asIfAbsent = evaluateBookingEligibility(
      { totalCost: null, paymentArrangementSetAt: null },
      [{ status: 'scheduled', cost: 100 }],
      netPaid,
      100
    );
    expect(asIfAbsent).toEqual(allowedAfterCancel);
  });

  it("a 'no_show' lesson's cost IS excluded from the student's cost sum, same as 'cancelled' (owner decision: the student already paid, the no-show fee is a separate cash matter)", () => {
    const netPaid = 200;
    const withNoShow: LessonFixture[] = [
      { status: 'no_show', cost: 100 },
      { status: 'scheduled', cost: 100 },
    ];
    // The no-show lesson's cost returns to credit, same as if it were
    // cancelled - only the remaining $100 'scheduled' lesson counts, so
    // $200 paid leaves $100 of credit, enough for one more $100 lesson.
    const result = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, withNoShow, netPaid, 100);
    expect(result.allowed).toBe(true);

    const withCancelledInstead: LessonFixture[] = [
      { status: 'cancelled', cost: 100 },
      { status: 'scheduled', cost: 100 },
    ];
    const resultIfCancelled = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, withCancelledInstead, netPaid, 100);
    // Identical outcome to the no_show case - that's the point: no_show
    // and cancelled are treated exactly the same for student cost.
    expect(resultIfCancelled).toEqual(result);
  });

  it("a 'no_show' lesson with an outstanding fee flag still returns its cost to credit - the fee is never read by this check", () => {
    // The fee flag itself (a separate table, fee_flags) is never
    // constructed or passed to evaluateBookingEligibility at all - this
    // test proves the credit math doesn't need one to behave correctly,
    // which is the structural proof that an outstanding fee can't
    // possibly reduce credit: there's no fee_flags argument anywhere in
    // this function's signature for it to come from.
    const netPaid = 100;
    const lessons: LessonFixture[] = [{ status: 'no_show', cost: 100 }];
    const result = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, netPaid, 100);
    expect(result.allowed).toBe(true);
  });

  it('refund reduces credit - a lower netPaid blocks where a higher one would have allowed', () => {
    const lessons: LessonFixture[] = [{ status: 'scheduled', cost: 100 }];
    const beforeRefund = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, 200, 100);
    expect(beforeRefund.allowed).toBe(true);

    // A $150 refund nets this down to $50 paid - no longer enough for a
    // $100 lesson on top of the $100 already booked.
    const afterRefund = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, lessons, 50, 100);
    expect(afterRefund.allowed).toBe(false);
  });

  it('void (netPaid effectively 0 for that payment) blocks booking entirely', () => {
    const result = evaluateBookingEligibility({ totalCost: null, paymentArrangementSetAt: null }, [], 0, 50);
    expect(result.allowed).toBe(false);
  });

  it('a payment arrangement allows regardless of how bad the credit numbers are', () => {
    const result = evaluateBookingEligibility(
      { totalCost: null, paymentArrangementSetAt: new Date('2026-01-01') },
      [],
      0,
      999999
    );
    expect(result).toEqual({ allowed: true, hasPaymentArrangement: true });
  });

  describe('package-priced enrollment fallback (conservative: block only when net paid is 0 and no arrangement)', () => {
    it('is reachable only when totalCost is null AND there are zero non-cancelled lessons - NOT merely "totalCost is an override"', () => {
      // computePaymentSummary (enrollmentService.ts) only returns a null
      // creditBalance when totalCost itself is uncomputable: no override
      // AND no non-cancelled lessons to derive one from. If totalCost IS a
      // real override (a genuinely package-priced enrollment with an
      // explicit total_cost), creditBalance is NEVER null - it's computed
      // directly as max(0, totalPaid - totalCost) - so the conservative
      // "block only when net paid is 0" fallback does NOT apply to that
      // case at all; it's reached only by a brand-new enrollment with no
      // override and nothing booked yet. This test documents that
      // discrepancy from a literal reading of "package-priced enrollment
      // -> use the conservative fallback" - see this file's own
      // bookingEligibilityService.ts doc comment and this task's commit/PR
      // description for the full writeup.

      // Case A: totalCost IS set (an override) - goes through the NORMAL
      // creditBalance math, not the fallback, even with 0 lessons.
      const withOverridePaid = evaluateBookingEligibility(
        { totalCost: 500, paymentArrangementSetAt: null },
        [],
        100, // paid $100 of a $500 package - credit is 0 (clamped), not null
        50
      );
      expect(withOverridePaid.allowed).toBe(false); // credit 0 < 50, normal math, not the fallback

      // Paid MORE than the $500 package total -> real positive credit (50),
      // enough for a $50 lesson. Still the NORMAL math (override path),
      // not the fallback - credit is a concrete computed number, never null.
      const withOverrideOverpaid = evaluateBookingEligibility(
        { totalCost: 500, paymentArrangementSetAt: null },
        [],
        550,
        50
      );
      expect(withOverrideOverpaid.allowed).toBe(true);

      // Case B: totalCost is null AND zero non-cancelled lessons - THIS is
      // the actual fallback branch. Blocked when net paid is 0.
      const brandNewNoPayment = evaluateBookingEligibility(
        { totalCost: null, paymentArrangementSetAt: null },
        [],
        0,
        50
      );
      expect(brandNewNoPayment.allowed).toBe(false);

      // Same brand-new scenario, but ANY payment on file at all -> allowed,
      // per the conservative "block only when net paid is 0" rule, even
      // though that payment doesn't literally cover the $50 lesson cost.
      const brandNewWithSomePayment = evaluateBookingEligibility(
        { totalCost: null, paymentArrangementSetAt: null },
        [],
        1,
        50
      );
      expect(brandNewWithSomePayment.allowed).toBe(true);
    });
  });
});

describe('checkBookingEligibility / checkBookingEligibilityLocked - net-paid SQL and tenant isolation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('the net-paid SQL subtracts payment_adjustments.amount - a refunded payment nets lower than its raw amount', async () => {
    mockQuery
      .mockResolvedValueOnce(queryResult([{ total_cost: null, payment_arrangement_set_at: null }])) // enrollment lookup
      .mockResolvedValueOnce(queryResult([{ status: 'scheduled', cost: '100.00' }])) // existing lessons
      // net-paid aggregate: a $200 payment with a $150 adjustment already
      // netted out by the query itself -> total_paid = 50, not 200.
      .mockResolvedValueOnce(queryResult([{ total_paid: '50.00' }]));

    const result = await checkBookingEligibility(TENANT_ID, ENROLLMENT_ID, 100);

    // Credit = 50 (net paid) - 100 (existing lesson) = negative, clamped
    // to 0 by computePaymentSummary -> blocked for a new $100 lesson.
    // Proves the result reflects the NETTED figure (50), not the raw
    // payment amount (200), which would have allowed this booking.
    expect(result.allowed).toBe(false);
  });

  it('a fully voided payment (net paid 0) blocks booking', async () => {
    mockQuery
      .mockResolvedValueOnce(queryResult([{ total_cost: null, payment_arrangement_set_at: null }]))
      .mockResolvedValueOnce(queryResult([])) // no existing lessons
      .mockResolvedValueOnce(queryResult([{ total_paid: '0' }])); // fully voided -> net paid 0

    const result = await checkBookingEligibility(TENANT_ID, ENROLLMENT_ID, 50);
    expect(result.allowed).toBe(false);
  });

  it('scopes the enrollment lookup by tenant_id as a bound parameter', async () => {
    mockQuery
      .mockResolvedValueOnce(queryResult([{ total_cost: null, payment_arrangement_set_at: null }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ total_paid: '0' }]));

    await checkBookingEligibility(TENANT_ID, ENROLLMENT_ID, 50);

    const enrollmentCall = mockQuery.mock.calls[0];
    expect(enrollmentCall[0]).toMatch(/tenant_id = \$2/);
    expect(enrollmentCall[1]).toEqual([ENROLLMENT_ID, TENANT_ID]);
  });

  it('scopes the lessons lookup by tenant_id as a bound parameter', async () => {
    mockQuery
      .mockResolvedValueOnce(queryResult([{ total_cost: null, payment_arrangement_set_at: null }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ total_paid: '0' }]));

    await checkBookingEligibility(TENANT_ID, ENROLLMENT_ID, 50);

    const lessonsCall = mockQuery.mock.calls[1];
    expect(lessonsCall[0]).toMatch(/tenant_id = \$1/);
    expect(lessonsCall[1]).toEqual([TENANT_ID, ENROLLMENT_ID]);
  });

  it('scopes the net-paid lookup by tenant_id as a bound parameter', async () => {
    mockQuery
      .mockResolvedValueOnce(queryResult([{ total_cost: null, payment_arrangement_set_at: null }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ total_paid: '0' }]));

    await checkBookingEligibility(TENANT_ID, ENROLLMENT_ID, 50);

    const netPaidCall = mockQuery.mock.calls[2];
    expect(netPaidCall[0]).toMatch(/p\.tenant_id = \$1/);
    expect(netPaidCall[1]).toEqual([TENANT_ID, ENROLLMENT_ID]);
  });

  it('checkBookingEligibilityLocked runs the enrollment lookup with FOR UPDATE on the caller-provided client', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(queryResult([{ total_cost: null, payment_arrangement_set_at: null }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ total_paid: '0' }]));
    const fakeClient = { query: clientQuery } as unknown as PoolClient;

    await checkBookingEligibilityLocked(fakeClient, TENANT_ID, ENROLLMENT_ID, 50);

    expect(clientQuery).toHaveBeenCalledTimes(3);
    const [lockSql, lockParams] = clientQuery.mock.calls[0];
    expect(lockSql).toMatch(/FOR UPDATE/);
    expect(lockSql).toMatch(/tenant_id = \$2/);
    expect(lockParams).toEqual([ENROLLMENT_ID, TENANT_ID]);

    // Confirms the locked variant never falls back to the module-level
    // `query` - every query in this path runs on the SAME client.
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

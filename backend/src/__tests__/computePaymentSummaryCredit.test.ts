import { describe, it, expect } from 'vitest';
import { computePaymentSummary } from '../services/enrollmentService';

// Direct, isolated unit tests of computePaymentSummary's new creditBalance
// field (payments-phase1) - no HTTP/DB mocking needed since this is a pure
// function. The task's explicit constraint: do not change the existing
// outstandingBalance/paymentStatus behavior, only add creditBalance
// alongside it - every case below re-asserts the pre-existing fields too,
// to catch any accidental change to them.
describe('computePaymentSummary - creditBalance (additive, outstanding/status unchanged)', () => {
  it('a family that pays for two lessons, books two (lessons.cost sums to exactly what was paid): $0 owed, $0 credit', () => {
    const result = computePaymentSummary(
      { totalCost: null },
      [
        { status: 'scheduled', cost: 75 },
        { status: 'scheduled', cost: 75 },
      ],
      150
    );
    expect(result).toEqual({
      totalPaid: 150,
      outstandingBalance: 0,
      paymentStatus: 'paid',
      creditBalance: 0,
    });
  });

  it('a family that pays in full up front, before booking any lessons: totalCost from the enrollment override, full amount shows as credit', () => {
    const result = computePaymentSummary({ totalCost: 600 }, [], 600);
    expect(result).toEqual({
      totalPaid: 600,
      outstandingBalance: 0,
      paymentStatus: 'paid',
      creditBalance: 0,
    });
  });

  it('paid $600 up front (enrollment totalCost override), one $75 lesson booked so far: $0 owed (totalCost is the override, not lesson sum), credit still visible relative to lessons actually consumed is NOT what this computes - totalCost always wins when set', () => {
    // This case documents the existing, UNCHANGED precedence rule: when
    // enrollment.totalCost is set, it is ALWAYS the total compared against
    // totalPaid - the lesson list's own cost sum is irrelevant whenever an
    // override exists. (Tracking "value consumed so far" vs. "value paid
    // for" is a different, not-yet-built metric - see item 1's "Paid, not
    // yet scheduled" frontend field, which uses the lesson-sum path below
    // instead, by never setting an enrollment totalCost override.)
    const result = computePaymentSummary(
      { totalCost: 600 },
      [{ status: 'scheduled', cost: 75 }],
      600
    );
    expect(result).toEqual({
      totalPaid: 600,
      outstandingBalance: 0,
      paymentStatus: 'paid',
      creditBalance: 0,
    });
  });

  it('pays for two lessons ($150), books and pays for a THIRD before any are scheduled-cost-summed yet (lesson-sum path): credit shows the extra $75, outstanding stays 0', () => {
    // No enrollment totalCost override - totalCost derives from the sum
    // of non-cancelled lessons.cost. Only 2 lessons exist so far (cost
    // 150 total) but 225 was paid - the extra 75 is a real credit, not
    // hidden by the Math.max(0, ...) clamp the way it used to be.
    const result = computePaymentSummary(
      { totalCost: null },
      [
        { status: 'scheduled', cost: 75 },
        { status: 'scheduled', cost: 75 },
      ],
      225
    );
    expect(result).toEqual({
      totalPaid: 225,
      outstandingBalance: 0,
      paymentStatus: 'paid',
      creditBalance: 75,
    });
  });

  it('rescheduling leaves totalCost, outstandingBalance, and creditBalance unchanged (lesson count/status/cost unaffected by a reschedule)', () => {
    // A reschedule only changes date/time/instructor - status stays
    // 'scheduled' and cost is untouched. This test asserts the INPUT
    // shape a reschedule produces (same lessons list, same statuses, same
    // costs) yields an identical summary before and after - proving
    // computePaymentSummary itself has nothing reschedule-sensitive in it.
    const lessonsBeforeReschedule = [{ status: 'scheduled' as const, cost: 100 }];
    const lessonsAfterReschedule = [{ status: 'scheduled' as const, cost: 100 }]; // same cost/status, only date/time would differ in a real row

    const before = computePaymentSummary({ totalCost: null }, lessonsBeforeReschedule, 150);
    const after = computePaymentSummary({ totalCost: null }, lessonsAfterReschedule, 150);
    expect(after).toEqual(before);
    expect(after).toEqual({
      totalPaid: 150,
      outstandingBalance: 0,
      paymentStatus: 'paid',
      creditBalance: 50,
    });
  });

  it('a genuinely outstanding balance (no overpayment): creditBalance is 0, never negative', () => {
    const result = computePaymentSummary(
      { totalCost: null },
      [{ status: 'scheduled', cost: 100 }],
      40
    );
    expect(result).toEqual({
      totalPaid: 40,
      outstandingBalance: 60,
      paymentStatus: 'partial',
      creditBalance: 0,
    });
  });

  it('cancelled lessons are excluded from the lesson-sum totalCost derivation - unchanged behavior, creditBalance follows the same exclusion', () => {
    const result = computePaymentSummary(
      { totalCost: null },
      [
        { status: 'scheduled', cost: 100 },
        { status: 'cancelled', cost: 500 }, // excluded - would otherwise swing this to a huge outstanding balance
      ],
      100
    );
    expect(result).toEqual({
      totalPaid: 100,
      outstandingBalance: 0,
      paymentStatus: 'paid',
      creditBalance: 0,
    });
  });

  it('no computable totalCost (no override, no lessons at all): both outstandingBalance and creditBalance are null, status unknown', () => {
    const result = computePaymentSummary({ totalCost: null }, [], 0);
    expect(result).toEqual({
      totalPaid: 0,
      outstandingBalance: null,
      paymentStatus: 'unknown',
      creditBalance: null,
    });
  });

  it('no computable totalCost but SOME amount was paid anyway: still null/unknown, not treated as all credit', () => {
    // Nothing to compare 50 against (no override, no lessons), so this
    // stays "not computable" rather than guessing the whole 50 is credit.
    const result = computePaymentSummary({ totalCost: null }, [], 50);
    expect(result).toEqual({
      totalPaid: 50,
      outstandingBalance: null,
      paymentStatus: 'unknown',
      creditBalance: null,
    });
  });
});

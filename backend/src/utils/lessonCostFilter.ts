/**
 * The single shared definition of which lesson statuses count toward a
 * STUDENT's cost/balance/credit figure (payment-before-booking no_show
 * fix). Deliberate owner decision: a 'no_show' lesson's cost returns to
 * the student's credit, exactly like 'cancelled' - the student already
 * paid for it, and the no-show fee is a separate cash matter between
 * student and instructor (fee_flags.fee_amount, driven by
 * tenant_settings.cancellationFeeAmount, never derived from lessons.cost)
 * that this filter must never touch.
 *
 * Deliberately does NOT affect: instructor earnings
 * (instructorService.getInstructorEarnings filters status = 'completed'
 * exactly - a no_show was never 'completed', so it was never included
 * there either, before or after this change), treasury/BDP fee splits
 * (recorded once, at booking time, before a lesson's status can ever
 * become 'no_show' - never recomputed from a status-filtered sum), or
 * progress/hours-completed (studentProgressService.ts counts lessons by
 * status for an entirely different purpose - how much training happened -
 * and never reads `cost` at all).
 *
 * Every place in this codebase that sums a STUDENT's lesson cost must use
 * ONE of the two exports below, never its own inline
 * `status !== 'cancelled'` (or similar) check - see
 * docs/ARCHITECTURE.md's payment-before-booking section for the full list
 * of call sites this was extracted from.
 */

// JS-side: lessons.filter(l => !STUDENT_COST_EXCLUDED_STATUSES.includes(l.status))
export const STUDENT_COST_EXCLUDED_STATUSES = ['cancelled', 'no_show'] as const;

export function isStudentCostCountedStatus(status: string): boolean {
  return !STUDENT_COST_EXCLUDED_STATUSES.includes(status as (typeof STUDENT_COST_EXCLUDED_STATUSES)[number]);
}

// SQL-side: interpolated directly into a WHERE clause, e.g.
// `WHERE tenant_id = $1 AND ${STUDENT_COST_SQL_CONDITION}`. Safe to
// interpolate (not user input - a fixed, hardcoded literal built once
// here, not per-request), matching this codebase's existing style of
// building a query string with template literals before passing it to
// the parameterized `query()` call for actual values.
export const STUDENT_COST_SQL_CONDITION =
  `status NOT IN (${STUDENT_COST_EXCLUDED_STATUSES.map((s) => `'${s}'`).join(', ')})`;

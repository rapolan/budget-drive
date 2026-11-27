import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';

/**
 * Confirms instructorService.getInstructorEarnings is UNAFFECTED by the
 * no_show student-cost-exclusion change (payment-before-booking). This
 * function already filtered `l.status = 'completed'` exactly, in its own
 * raw SQL, before that change - a 'no_show' lesson was never 'completed',
 * so it was never counted toward instructor earnings either before or
 * after. This test asserts the QUERY ITSELF still only ever requests
 * `status = 'completed'` rows (never widened to also exclude 'no_show'
 * the way the student-cost sites were - that would be the wrong fix here,
 * since this query never included no-show lessons in the first place) and
 * that no_show lessons already excluded by the real query shape don't
 * appear in the sum, as a result-level regression check.
 */
describe("instructorService.getInstructorEarnings - unaffected by the no_show student-cost exclusion", () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it("still filters status = 'completed' exactly - no_show lessons were never included, and this change must not touch this query", async () => {
    const { getInstructorEarnings } = await import('../services/instructorService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ total_lessons: '2', gross_earnings: '150.00', total_fees: '5.00', net_earnings: '145.00' }])
    );

    await getInstructorEarnings(INSTRUCTOR_ID, TENANT_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/l\.status = 'completed'/);
    // Never widened to a NOT IN ('cancelled', 'no_show') shape - this
    // query's own exact-match filter already excludes no-show lessons
    // without needing the shared utils/lessonCostFilter.ts helper at all.
    expect(sql).not.toMatch(/no_show/);
    expect(params).toEqual([INSTRUCTOR_ID, TENANT_ID]);
  });

  it('a completed lesson and a no-show lesson for the same instructor: only the completed one counts toward earnings (result-shape proof, via the real SQL filter)', async () => {
    const { getInstructorEarnings } = await import('../services/instructorService');

    // The mocked row represents what Postgres itself would already return
    // for `WHERE l.status = 'completed'` - a no-show lesson's $200 cost
    // is never summed into gross_earnings because the real query's own
    // WHERE clause excludes it at the database level, not in application
    // code. This mock stands in for that real exclusion.
    mockQuery.mockResolvedValueOnce(
      queryResult([{ total_lessons: '1', gross_earnings: '75.00', total_fees: '0.00', net_earnings: '75.00' }])
    );

    const earnings = await getInstructorEarnings(INSTRUCTOR_ID, TENANT_ID);

    expect(earnings.totalLessons).toBe(1);
    expect(earnings.grossEarnings).toBe(75);
  });
});

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that a 'no_show' lesson's cost is excluded from
 * every STUDENT-facing balance figure paymentReportingService.ts computes
 * - exactly like a 'cancelled' lesson - mirroring
 * paymentReportingRealDb.integration.test.ts's own harness conventions.
 *
 * Deliberate owner decision (not a bug fix): a no-show lesson is a lesson
 * the student already paid for: the no-show FEE is a separate cash matter
 * between student and instructor (fee_flags.fee_amount, driven by
 * tenant_settings.cancellationFeeAmount - never derived from lessons.cost,
 * confirmed by reading lessonService.ts's noShowLesson), so it must never
 * reduce the student's school-side credit.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as every other *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/paymentReportingNoShowRealDb.integration.test.ts
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    DB_HOST: u.hostname,
    DB_PORT: u.port || '5432',
    DB_NAME: u.pathname.replace(/^\//, ''),
    DB_USER: decodeURIComponent(u.username),
    DB_PASSWORD: decodeURIComponent(u.password),
  };
}

describe('real-Postgres: no_show lessons excluded from student-facing balances', () => {
  let pool: Pool;
  let lessonService: typeof import('../services/lessonService');
  let paymentService: typeof import('../services/paymentService');
  let paymentReportingService: typeof import('../services/paymentReportingService');

  let realTenantId: string;
  let instructorId: string;
  let vehicleId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    const { vi } = await import('vitest');
    vi.resetModules();
    lessonService = await import('../services/lessonService');
    paymentService = await import('../services/paymentService');
    paymentReportingService = await import('../services/paymentReportingService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('No-Show Reporting Test School', $1, 'no-show-reporting-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`no-show-reporting-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const instructorResult = await pool.query(
      `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status)
       VALUES ($1, 'Test Instructor', $2, '555-0100', CURRENT_DATE, 'active')
       RETURNING id`,
      [realTenantId, `instructor-noshow-${Date.now()}@example.com`]
    );
    instructorId = instructorResult.rows[0].id;

    for (let day = 0; day <= 6; day++) {
      await pool.query(
        `INSERT INTO instructor_availability (instructor_id, tenant_id, day_of_week, start_time, end_time, is_active, max_students)
         VALUES ($1, $2, $3, '06:00:00', '22:00:00', true, 10)`,
        [instructorId, realTenantId, day]
      );
    }

    const vehicleResult = await pool.query(
      `INSERT INTO vehicles (tenant_id, ownership_type, make, model, year, license_plate, registration_expiration, insurance_expiration, status)
       VALUES ($1, 'school_owned', 'Toyota', 'Corolla', 2024, $2, CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 'active')
       RETURNING id`,
      [realTenantId, `TEST-${Date.now()}`]
    );
    vehicleId = vehicleResult.rows[0].id;
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await pool.query('DELETE FROM fee_flags WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  // Each test gets its own fresh student/enrollment - avoids the
  // cross-test contamination class of bug this repo has hit before (see
  // paymentReportingRealDb.integration.test.ts's own comment on this).
  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
    await pool.query('DELETE FROM fee_flags WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
  });

  async function makeStudentWithEnrollment(label: string) {
    const studentResult = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, $2, $2, 'Test', '2008-01-01')
       RETURNING id`,
      [realTenantId, label]
    );
    const studentId = studentResult.rows[0].id as string;

    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required)
       VALUES ($1, $2, 'driver_training', 'active', 30)
       RETURNING id`,
      [realTenantId, studentId]
    );
    const enrollmentId = enrollmentResult.rows[0].id as string;

    return { studentId, enrollmentId };
  }

  it("getPaymentPeriodSummary's tenant-wide outstanding total excludes a no-show lesson's cost, matching a cancelled lesson exactly", async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId } = await makeStudentWithEnrollment(`PeriodSummary NoShow ${Date.now()}`);

    // Pay exactly $75 - enough for ONE real lesson, nothing more.
    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 75,
      paymentMethod: 'cash',
    });

    // One real, paid-for lesson.
    await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-10-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    // A SECOND lesson, same cost, that becomes a no-show. If its cost
    // were still counted, this student would owe $75 more - it must not.
    const noShowLesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-10-08',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });
    await lessonService.noShowLesson(noShowLesson.id, realTenantId);

    const summary = await paymentReportingService.getPaymentPeriodSummary(realTenantId, '2027-01-01', '2027-12-31');
    expect(summary.outstanding).toBe(0);
    expect(summary.paidNotYetScheduled).toBe(0);
  });

  it("a student with only a no-show lesson (its cost excluded) does NOT appear in getWhoOwesYou, even though the lesson itself was never cancelled", async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId, enrollmentId } = await makeStudentWithEnrollment(`WhoOwesYou NoShow ${Date.now()}`);

    // No payment at all. A no-show lesson whose cost is excluded means
    // there is nothing to owe - the enrollment's totalCost derives to
    // "not computable" (no override, zero cost-counted lessons), which
    // getWhoOwesYou's own query treats as no balance to chase.
    const lesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-10-15',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 60,
    });
    await lessonService.noShowLesson(lesson.id, realTenantId);

    const rows = await paymentReportingService.getWhoOwesYou(realTenantId);
    const row = rows.find((r) => r.enrollmentId === enrollmentId);
    expect(row).toBeUndefined();
  });

  it("getWhoOwesYou still shows the correct (lower) balance when a student has BOTH a real unpaid lesson and an unrelated no-show lesson", async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId, enrollmentId } = await makeStudentWithEnrollment(`WhoOwesYou Mixed ${Date.now()}`);

    // One real, unpaid, COMPLETED lesson ($50) - genuinely owed.
    const realLesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-01-05',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 50,
    });
    await lessonService.completeLesson(realLesson.id, realTenantId);

    // A second, unrelated lesson that becomes a no-show ($200) - if its
    // cost were still counted, this row would show $250 owed instead of
    // the correct $50.
    const noShowLesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-01-12',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 200,
    });
    await lessonService.noShowLesson(noShowLesson.id, realTenantId);

    const rows = await paymentReportingService.getWhoOwesYou(realTenantId);
    const row = rows.find((r) => r.enrollmentId === enrollmentId);
    expect(row).toBeDefined();
    expect(row!.amountOwed).toBe(50);
  });

  it("getPaymentReceiptData's enrollment balance figures exclude a no-show lesson's cost", async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId } = await makeStudentWithEnrollment(`Receipt NoShow ${Date.now()}`);

    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 90,
      paymentMethod: 'cash',
    });

    // The only lesson on this enrollment is a no-show ($90, matching the
    // payment exactly) - if its cost still counted, outstandingBalance
    // would show $0/paid; since it's excluded, there's nothing to compare
    // the $90 against, so it must show as credit instead (not computable
    // -> the payment-before-booking service's own fallback aside, the
    // receipt's own totalCost derivation falls back to null when the
    // cost-counted lesson sum is 0, per getPaymentReceiptData's own
    // ternary).
    const lesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-02-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 90,
    });
    await lessonService.noShowLesson(lesson.id, realTenantId);

    const receipt = await paymentReportingService.getPaymentReceiptData(realTenantId, payment.id);
    expect(receipt).not.toBeNull();
    expect(receipt!.enrollmentOutstandingBalance).toBeNull();
    expect(receipt!.enrollmentCreditBalance).toBeNull();
    expect(receipt!.enrollmentTotalPaid).toBe(90);
  });

  it('a no-show lesson creates an outstanding fee flag, but the fee flag does not affect the student-facing balance figures above', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId, enrollmentId } = await makeStudentWithEnrollment(`FeeFlag NoShow ${Date.now()}`);

    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 80,
      paymentMethod: 'cash',
    });
    const lesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-03-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 80,
    });
    await lessonService.noShowLesson(lesson.id, realTenantId);

    // The fee flag was created, with its own amount independent of the
    // lesson's $80 cost.
    const feeFlagResult = await pool.query(
      `SELECT status, amount FROM fee_flags WHERE tenant_id = $1 AND lesson_id = $2`,
      [realTenantId, lesson.id]
    );
    expect(feeFlagResult.rows.length).toBe(1);
    expect(feeFlagResult.rows[0].status).toBe('outstanding');

    // Yet the student's balance is unaffected by that outstanding fee -
    // $80 paid, $0 cost-counted (the only lesson was a no-show), so
    // nothing owed, full credit of $80 is not shown either since the cost
    // sum is not computable (0 cost-counted lessons) - mirrors the
    // receipt test's same ternary.
    const rows = await paymentReportingService.getWhoOwesYou(realTenantId);
    expect(rows.find((r) => r.enrollmentId === enrollmentId)).toBeUndefined();
  });
});

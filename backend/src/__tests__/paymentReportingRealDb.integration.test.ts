import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof of the 4 balance/credit scenarios the payments-phase1
 * task calls out by name. Each one exercises the REAL service functions
 * (lessonService.createLesson/completeLesson/cancelLesson, paymentService.
 * createPayment, enrollmentService.computePaymentSummary via
 * getEnrollmentsForStudent) against a real database - a mocked test can't
 * catch a real SQL/aggregation bug the way these can.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as every other *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/paymentReportingRealDb.integration.test.ts
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

describe('real-Postgres: payments-phase1 balance/credit scenarios', () => {
  let pool: Pool;
  let lessonService: typeof import('../services/lessonService');
  let paymentService: typeof import('../services/paymentService');
  let enrollmentService: typeof import('../services/enrollmentService');

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
    enrollmentService = await import('../services/enrollmentService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Payment Reporting Test School', $1, 'payment-reporting-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`payment-reporting-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const instructorResult = await pool.query(
      `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status)
       VALUES ($1, 'Test Instructor', $2, '555-0100', CURRENT_DATE, 'active')
       RETURNING id`,
      [realTenantId, `instructor-${Date.now()}@example.com`]
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
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  // Each test gets its own fresh student/enrollment (created inside the
  // test itself) rather than sharing one across the file - the exact fix
  // for the cross-test contamination bug found earlier this session
  // (lessonServiceLastCompletedNoteRealDb.integration.test.ts), avoided
  // here from the start rather than patched after the fact.
  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
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

  async function getPaymentSummaryFor(studentId: string, dateOfBirth: Date) {
    const enrollments = await enrollmentService.getEnrollmentsForStudent(studentId, realTenantId, { dateOfBirth });
    return enrollments.find((e) => e.programType === 'driver_training')?.paymentSummary;
  }

  it('(a) a family pays for two lessons, books two: shows $0 owed with no credit', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId } = await makeStudentWithEnrollment(`Two Lessons Paid ${Date.now()}`);

    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 150, // 2 x $75
      paymentMethod: 'cash',
    });

    const lessonA = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });
    await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-08',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    const summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: 0, creditBalance: 0, paymentStatus: 'paid' });
    void lessonA;
  });

  it('(b) a family pays in full, books lessons over time: credit falls as lessons are booked', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId, enrollmentId } = await makeStudentWithEnrollment(`Pay In Full Over Time ${Date.now()}`);
    void enrollmentId; // no enrollment.totalCost override in this scenario - see note below

    // Pay for the whole package ($300) up front, before booking anything.
    // Deliberately NO enrollment.totalCost override here - per the
    // documented precedence (computePaymentSummary's own comment, and
    // computePaymentSummaryCredit.test.ts's case for it), an override
    // ALWAYS wins over the lesson-sum total when one is set, which would
    // make "credit falls as lessons are booked" impossible to observe (the
    // total booking anything is compared against stays fixed at the
    // override regardless of what's booked). The realistic shape of this
    // scenario - and the one "Paid, not yet scheduled" on the frontend
    // actually reads - is the lesson-sum path: nothing booked yet means
    // totalCost is null (not computable), so the $300 paid shows as fully
    // "not yet owed against anything," not as a $300 credit per se.
    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 300,
      paymentMethod: 'cash',
    });

    let summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: null, paymentStatus: 'unknown', creditBalance: null });

    // Book the first lesson ($75) - now there's something to compare the
    // $300 paid against: $225 of it is credit (paid but not yet consumed
    // by a booked lesson).
    await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });
    summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: 0, creditBalance: 225 }); // 300 paid - 75 booked so far

    // Book a second lesson ($75 more, $150 total booked) - credit falls
    // further, exactly tracking what's been booked so far.
    await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-08',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });
    summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: 0, creditBalance: 150 }); // 300 paid - 150 booked so far
  });

  it('(c) rescheduling a lesson leaves balance and credit unchanged', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId } = await makeStudentWithEnrollment(`Reschedule Unchanged ${Date.now()}`);

    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 50,
      paymentMethod: 'cash',
    });
    const lesson = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    const before = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(before).toMatchObject({ outstandingBalance: 25, creditBalance: 0 });

    // Reschedule: date/time change only, same cost/status - exactly what
    // SmartBookingForm's reschedule-mode update payload sends (see
    // docs/ARCHITECTURE.md §38 - lessonNumber is also never sent on
    // reschedule, unrelated to this test but the same call shape).
    await lessonService.updateLesson(lesson.id, realTenantId, {
      date: '2027-09-15',
      startTime: '14:00',
      endTime: '15:00',
      duration: 60,
    } as any);

    const after = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(after).toEqual(before);
  });

  it('(d) cancel then rebook applies the existing payment to the new lesson with no double charge', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId } = await makeStudentWithEnrollment(`Cancel Rebook No Double Charge ${Date.now()}`);

    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 75,
      paymentMethod: 'cash',
    });
    const original = await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-01',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    let summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: 0, creditBalance: 0, paymentStatus: 'paid' });

    await lessonService.cancelLesson(original.id, realTenantId);

    // Cancelled lessons are excluded from the lesson-sum totalCost
    // derivation entirely (same rule computePaymentSummaryCredit.test.ts
    // asserts directly) - with nothing left to compare the 75 already
    // paid against, this is correctly "not computable" rather than
    // showing the whole 75 as a sudden credit.
    summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: null, paymentStatus: 'unknown' });

    // Rebook - the SAME $75 payment (never a second one) should now
    // apply cleanly to the new lesson with no double charge.
    await lessonService.createLesson(realTenantId, {
      studentId,
      instructorId,
      vehicleId,
      date: '2027-09-15',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    summary = await getPaymentSummaryFor(studentId, new Date('2008-01-01'));
    expect(summary).toMatchObject({ outstandingBalance: 0, creditBalance: 0, paymentStatus: 'paid' });

    const paymentsResult = await pool.query(
      `SELECT COUNT(*) FROM payments WHERE tenant_id = $1 AND enrollment_id = (SELECT id FROM enrollments WHERE student_id = $2)`,
      [realTenantId, studentId]
    );
    expect(parseInt(paymentsResult.rows[0].count, 10)).toBe(1); // still just the one payment - no double charge
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that the row lock in
 * bookingEligibilityService.checkBookingEligibilityLocked actually
 * prevents two simultaneous createLesson calls against the SAME
 * enrollment from both passing on the same credit - the property no
 * mocked test can observe (there's no real lock to race against).
 *
 * Setup: one enrollment with EXACTLY enough net paid for ONE $100 lesson
 * (credit = $100). Two concurrent createLesson calls, each requesting a
 * $100 lesson, on different dates (so the unrelated same-day-per-student
 * booking cap and the scheduling-conflict check never reject either one
 * for a reason unrelated to payment eligibility - the task's own
 * instruction). Assert: exactly one succeeds, the other rejects with a
 * 409 PAYMENT_REQUIRED - never both succeeding, which would mean $200 of
 * lessons got booked against $100 of credit.
 *
 * Gated behind TEST_DATABASE_URL, same convention as every other
 * *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/bookingEligibilityConcurrency.integration.test.ts
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

describe('real-Postgres: payment-before-booking concurrency - two simultaneous bookings cannot both pass on the same credit', () => {
  let pool: Pool;
  let lessonService: typeof import('../services/lessonService');

  let realTenantId: string;
  let instructorAId: string;
  let instructorBId: string;
  let vehicleId: string;
  let studentId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    vi.resetModules();
    lessonService = await import('../services/lessonService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Booking Eligibility Concurrency Test School', $1, 'booking-eligibility-concurrency-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`booking-eligibility-concurrency-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    // require_payment_before_booking = true for this tenant - the whole
    // point of this test.
    await pool.query(
      `INSERT INTO tenant_settings (tenant_id, business_name, require_payment_before_booking)
       VALUES ($1, 'Booking Eligibility Concurrency Test School', true)`,
      [realTenantId]
    );

    // Two instructors (so the two concurrent bookings never collide on
    // the SAME instructor's own schedule - only the shared enrollment's
    // credit is what this test wants to race).
    const makeInstructor = async (label: string) => {
      const res = await pool.query(
        `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status)
         VALUES ($1, $2, $3, '555-0100', CURRENT_DATE, 'active')
         RETURNING id`,
        [realTenantId, label, `${label.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}@example.com`]
      );
      const instructorId = res.rows[0].id as string;
      for (let day = 0; day <= 6; day++) {
        await pool.query(
          `INSERT INTO instructor_availability (instructor_id, tenant_id, day_of_week, start_time, end_time, is_active, max_students)
           VALUES ($1, $2, $3, '06:00:00', '22:00:00', true, 10)`,
          [instructorId, realTenantId, day]
        );
      }
      return instructorId;
    };
    instructorAId = await makeInstructor('Concurrency Instructor A');
    instructorBId = await makeInstructor('Concurrency Instructor B');

    const vehicleResult = await pool.query(
      `INSERT INTO vehicles (tenant_id, ownership_type, make, model, year, license_plate, registration_expiration, insurance_expiration, status)
       VALUES ($1, 'school_owned', 'Toyota', 'Corolla', 2024, $2, CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 'active')
       RETURNING id`,
      [realTenantId, `TEST-${Date.now()}`]
    );
    vehicleId = vehicleResult.rows[0].id;

    const studentResult = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, $2, $2, 'Test', '2008-01-01')
       RETURNING id`,
      [realTenantId, `Concurrency Student ${Date.now()}`]
    );
    studentId = studentResult.rows[0].id;

    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required)
       VALUES ($1, $2, 'driver_training', 'active', 30)
       RETURNING id`,
      [realTenantId, studentId]
    );
    const enrollmentId = enrollmentResult.rows[0].id as string;

    // Exactly $100 of confirmed net paid - enough for ONE $100 lesson, not two.
    await pool.query(
      `INSERT INTO payments (tenant_id, enrollment_id, date, amount, payment_method, payment_type, status)
       VALUES ($1, $2, CURRENT_DATE, 100.00, 'cash', 'lesson_payment', 'confirmed')`,
      [realTenantId, enrollmentId]
    );

    // Pre-create this tenant's scheduling_settings row. availabilityService.
    // getSchedulingSettings lazily INSERTs a default row on first access with
    // no ON CONFLICT guard - firing this test's two createLesson calls
    // concurrently without pre-seeding it races on that lazy INSERT itself
    // (both see no row, both try to INSERT, one hits
    // scheduling_settings_tenant_id_key) - an unrelated pre-existing bug in
    // availabilityService.ts, not something this task touches. Pre-seeding
    // it here keeps this test's own race isolated to the property it
    // actually tests (the booking-eligibility row lock), not this separate
    // one.
    await pool.query(`INSERT INTO scheduling_settings (tenant_id) VALUES ($1)`, [realTenantId]);
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  it('fires two concurrent $100 bookings against $100 of credit - exactly one succeeds, the other 409s PAYMENT_REQUIRED', async () => {
    if (!TEST_DATABASE_URL) return;

    const bookingA = lessonService.createLesson(realTenantId, {
      studentId,
      instructorId: instructorAId,
      vehicleId,
      date: '2027-05-03',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 100,
    });
    const bookingB = lessonService.createLesson(realTenantId, {
      studentId,
      instructorId: instructorBId,
      vehicleId,
      date: '2027-05-04',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 100,
    });

    const [resultA, resultB] = await Promise.allSettled([bookingA, bookingB]);

    const succeeded = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejection).toMatchObject({ statusCode: 409, code: 'PAYMENT_REQUIRED' });

    // Confirm at the database level too - exactly one lesson row exists
    // for this student, not two (never both $100 lessons booked against
    // $100 of credit).
    const lessonsResult = await pool.query(
      `SELECT l.id FROM lessons l
       JOIN enrollments e ON e.id = l.enrollment_id
       WHERE e.student_id = $1 AND l.tenant_id = $2`,
      [studentId, realTenantId]
    );
    expect(lessonsResult.rows).toHaveLength(1);
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that findRankedAvailableSlots/findAvailableSlots
 * correctly exclude the lesson being rescheduled when excludeLessonId is
 * given - not a mocked wiring test.
 *
 * Reproduces a real bug found live while reviewing Group B of the
 * lesson-edit-redesign: SmartBookingForm's reschedule mode never passed
 * excludeLessonId to the search endpoint, only to the final confirm/update
 * (which already had it automatically, via lessonService.updateLesson
 * passing its own `id` to validateLessonBooking). Without it, the lesson
 * being rescheduled still counts as "the student's lesson that day" in the
 * search - at the tenant's default maxLessonsPerStudentPerDay = 1, this
 * doesn't just hide the lesson's own exact slot, it hides the student's
 * ENTIRE day of availability, since the day-skip check
 * (studentLessonsToday.length >= maxLessonsPerStudentPerDay) counts the
 * lesson being moved as already occupying that day's one allowed slot.
 * Confirmed live against this exact scenario (instructor with a narrow
 * working window, one existing lesson, searching with vs without
 * excludeLessonId) before this test was written - see
 * docs/ARCHITECTURE.md's Group B follow-up section for the full trace.
 *
 * Gated behind TEST_DATABASE_URL, same convention as
 * lessonServiceUpdateRealDb.integration.test.ts.
 *
 * To run locally:
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/schedulingServiceExcludeLessonIdRealDb.integration.test.ts
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

// A Saturday comfortably in the future (past any min-advance-booking
// window) with a NARROW instructor working block (9:30-14:00, matching the
// live reproduction) so the test can tell "the lesson's own slot is
// excluded" apart from "the day just happens to have lots of spare room."
const TEST_DATE = '2027-05-01'; // a Saturday

describe('real-Postgres: findRankedAvailableSlots / findAvailableSlots excludeLessonId', () => {
  let pool: Pool;
  let schedulingService: typeof import('../services/schedulingService');

  let realTenantId: string;
  let instructorId: string;
  let vehicleId: string;
  let studentId: string;
  let otherStudentId: string;
  let lessonId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    vi.resetModules();
    schedulingService = await import('../services/schedulingService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Exclude Lesson Id Test School', $1, 'exclude-lesson-id-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`exclude-lesson-id-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const instructorResult = await pool.query(
      `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status, zip_code)
       VALUES ($1, 'Test Instructor', $2, '555-0100', CURRENT_DATE, 'active', '92101')
       RETURNING id`,
      [realTenantId, `instructor-${Date.now()}@example.com`]
    );
    instructorId = instructorResult.rows[0].id;

    // Narrow Saturday-only window (day_of_week 6), mirroring the live
    // reproduction - 4.5 hours, just enough for the existing lesson plus a
    // couple of 60-minute slots once the buffer is accounted for.
    await pool.query(
      `INSERT INTO instructor_availability (instructor_id, tenant_id, day_of_week, start_time, end_time, is_active, max_students)
       VALUES ($1, $2, 6, '09:30:00', '14:00:00', true, 10)`,
      [instructorId, realTenantId]
    );

    const vehicleResult = await pool.query(
      `INSERT INTO vehicles (tenant_id, ownership_type, make, model, year, license_plate, registration_expiration, insurance_expiration, status)
       VALUES ($1, 'school_owned', 'Toyota', 'Corolla', 2024, $2, CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 'active')
       RETURNING id`,
      [realTenantId, `TEST-${Date.now()}`]
    );
    vehicleId = vehicleResult.rows[0].id;

    const makeStudent = async (label: string) => {
      const res = await pool.query(
        `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth, zip_code)
         VALUES ($1, $2, $2, 'Test', '2008-01-01', '92101')
         RETURNING id`,
        [realTenantId, label]
      );
      return res.rows[0].id as string;
    };
    studentId = await makeStudent(`Reschedule Student ${Date.now()}`);
    otherStudentId = await makeStudent(`Other Student ${Date.now()}`);

    const makeActiveEnrollment = async (sId: string) => {
      const res = await pool.query(
        `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required)
         VALUES ($1, $2, 'driver_training', 'active', 30)
         RETURNING id`,
        [realTenantId, sId]
      );
      return res.rows[0].id as string;
    };
    const enrollmentId = await makeActiveEnrollment(studentId);
    await makeActiveEnrollment(otherStudentId);

    // The lesson under test: 09:30-10:30, leaving 11:00-14:00 free after
    // the tenant's 30-minute default buffer (same shape as the live
    // reproduction).
    const lessonResult = await pool.query(
      `INSERT INTO lessons (tenant_id, instructor_id, vehicle_id, date, start_time, end_time, duration, lesson_type, cost, enrollment_id, status)
       VALUES ($1, $2, $3, $4, '09:30:00', '10:30:00', 60, 'behind_wheel', 50, $5, 'scheduled')
       RETURNING id`,
      [realTenantId, instructorId, vehicleId, TEST_DATE, enrollmentId]
    );
    lessonId = lessonResult.rows[0].id;
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  it('without excludeLessonId: searching with the lesson\'s OWN student returns zero slots (the production bug)', async () => {
    if (!TEST_DATABASE_URL) return;

    const result = await schedulingService.findRankedAvailableSlots({
      tenantId: realTenantId,
      studentId,
      pickupZip: '92101',
      duration: 60,
      startDate: TEST_DATE,
      endDate: TEST_DATE,
      timePreference: 'any',
      instructorId,
    });

    expect(result.slots).toHaveLength(0);
  });

  it('without excludeLessonId: searching with a DIFFERENT student on the same instructor/day returns the real remaining slots (control)', async () => {
    if (!TEST_DATABASE_URL) return;

    const result = await schedulingService.findRankedAvailableSlots({
      tenantId: realTenantId,
      studentId: otherStudentId,
      pickupZip: '92101',
      duration: 60,
      startDate: TEST_DATE,
      endDate: TEST_DATE,
      timePreference: 'any',
      instructorId,
    });

    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('with excludeLessonId: the lesson\'s own student search returns the real remaining slots, including the lesson\'s own current slot', async () => {
    if (!TEST_DATABASE_URL) return;

    const result = await schedulingService.findRankedAvailableSlots({
      tenantId: realTenantId,
      studentId,
      pickupZip: '92101',
      duration: 60,
      startDate: TEST_DATE,
      endDate: TEST_DATE,
      timePreference: 'any',
      instructorId,
      excludeLessonId: lessonId,
    });

    expect(result.slots.length).toBeGreaterThan(0);
    const ownSlot = result.slots.find((s) => s.startTimeLocal === '09:30' && s.endTimeLocal === '10:30');
    expect(ownSlot).toBeDefined();
  });

  it('findAvailableSlots (the single-instructor function findRankedAvailableSlots calls internally) also honors excludeLessonId directly', async () => {
    if (!TEST_DATABASE_URL) return;

    const timezone = await schedulingService.resolveTimezone(realTenantId);
    // Must resolve TEST_DATE's midnight in the TENANT's own timezone, not
    // naive UTC midnight - findRankedAvailableSlots (which this function
    // mirrors by calling findAvailableSlots directly) derives its own
    // Date args the same way, via zonedWallClockToUtc, specifically
    // because a naive `new Date(\`${TEST_DATE}T00:00:00Z\`)` resolves to
    // the PREVIOUS calendar day once formatDate re-renders it back through
    // the tenant's zone (America/Los_Angeles is UTC-7/8).
    const { zonedWallClockToUtc } = await import('../utils/tenantTime');
    const startDate = zonedWallClockToUtc(TEST_DATE, '00:00', timezone);
    const endDate = zonedWallClockToUtc(TEST_DATE, '00:00', timezone);

    const withoutExclude = await schedulingService.findAvailableSlots({
      tenantId: realTenantId,
      instructorId,
      startDate,
      endDate,
      duration: 60,
      studentId,
      timezone,
    });
    expect(withoutExclude).toHaveLength(0);

    const withExclude = await schedulingService.findAvailableSlots({
      tenantId: realTenantId,
      instructorId,
      startDate,
      endDate,
      duration: 60,
      studentId,
      timezone,
      excludeLessonId: lessonId,
    });
    expect(withExclude.length).toBeGreaterThan(0);
  });
});

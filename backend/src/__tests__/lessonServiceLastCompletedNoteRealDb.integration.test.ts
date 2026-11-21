import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that getLastCompletedLessonNoteForStudent's "last"
 * genuinely means "most recent completed lesson strictly BEFORE the lesson
 * being viewed" - not merely "some other completed lesson," which could be
 * a later one. A mocked test can't catch this: a hand-written mock query
 * response has no real date/time ordering to get wrong.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as lessonServiceUpdateRealDb.integration.test.ts /
 * schedulingServiceExcludeLessonIdRealDb.integration.test.ts - an absent
 * env var shows as a no-op test run, not a silent gap.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/lessonServiceLastCompletedNoteRealDb.integration.test.ts
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

describe('real-Postgres: lessonService.getLastCompletedLessonNoteForStudent', () => {
  let pool: Pool;
  let lessonService: typeof import('../services/lessonService');

  let realTenantId: string;
  let instructorId: string;
  let vehicleId: string;
  let studentId: string;
  let enrollmentId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    const { vi } = await import('vitest');
    vi.resetModules();
    lessonService = await import('../services/lessonService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Last Completed Note Test School', $1, 'last-completed-note-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`last-completed-note-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const instructorResult = await pool.query(
      `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status)
       VALUES ($1, 'Test Instructor', $2, '555-0100', CURRENT_DATE, 'active')
       RETURNING id`,
      [realTenantId, `instructor-${Date.now()}@example.com`]
    );
    instructorId = instructorResult.rows[0].id;

    const vehicleResult = await pool.query(
      `INSERT INTO vehicles (tenant_id, ownership_type, make, model, year, license_plate, registration_expiration, insurance_expiration, status)
       VALUES ($1, 'school_owned', 'Toyota', 'Corolla', 2024, $2, CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 'active')
       RETURNING id`,
      [realTenantId, `TEST-${Date.now()}`]
    );
    vehicleId = vehicleResult.rows[0].id;

    const studentResult = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, 'Test Student', 'Test', 'Student', '2008-01-01')
       RETURNING id`,
      [realTenantId]
    );
    studentId = studentResult.rows[0].id;

    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required)
       VALUES ($1, $2, 'driver_training', 'active', 30)
       RETURNING id`,
      [realTenantId, studentId]
    );
    enrollmentId = enrollmentResult.rows[0].id;
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  // All test cases share the same student/enrollment (set up once in
  // beforeAll) - without this, a lesson row created by one test is still
  // visible to the next test's query (the student_id scope has no date
  // window), silently contaminating results across cases.
  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
    await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
  });

  async function makeLesson(opts: { date: string; startTime: string; status: string; notes: string | null }) {
    const result = await pool.query(
      `INSERT INTO lessons (tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, lesson_type, status, notes, cost)
       VALUES ($1, $2, $3, $4, $5, $6, ($6::time + interval '1 hour'), 60, 'behind_wheel', $7, $8, 50)
       RETURNING id`,
      [realTenantId, enrollmentId, instructorId, vehicleId, opts.date, opts.startTime, opts.status, opts.notes]
    );
    return result.rows[0].id as string;
  }

  it('returns the most recent COMPLETED lesson strictly before the viewed lesson, not a later one', async () => {
    if (!TEST_DATABASE_URL) return;

    const earlier = await makeLesson({ date: '2027-05-01', startTime: '09:00:00', status: 'completed', notes: 'Earlier lesson notes' });
    const viewed = await makeLesson({ date: '2027-05-15', startTime: '09:00:00', status: 'completed', notes: 'Viewed lesson notes' });
    const later = await makeLesson({ date: '2027-05-29', startTime: '09:00:00', status: 'completed', notes: 'Later lesson notes' });

    const result = await lessonService.getLastCompletedLessonNoteForStudent(realTenantId, studentId, viewed);

    expect(result).not.toBeNull();
    expect(result?.notes).toBe('Earlier lesson notes');
    expect(result?.notes).not.toBe('Later lesson notes');

    // Sanity: the "later" lesson genuinely exists and is excluded correctly,
    // not just coincidentally absent.
    const laterRow = await pool.query('SELECT notes FROM lessons WHERE id = $1', [later]);
    expect(laterRow.rows[0].notes).toBe('Later lesson notes');
    void earlier;
  });

  it('breaks ties on the same date by start_time, never returning a same-day lesson later in the day', async () => {
    if (!TEST_DATABASE_URL) return;

    await makeLesson({ date: '2027-06-01', startTime: '08:00:00', status: 'completed', notes: 'Morning lesson, same day, earlier' });
    const viewed = await makeLesson({ date: '2027-06-01', startTime: '14:00:00', status: 'completed', notes: 'Afternoon lesson being viewed' });
    await makeLesson({ date: '2027-06-01', startTime: '18:00:00', status: 'completed', notes: 'Evening lesson, same day, later' });

    const result = await lessonService.getLastCompletedLessonNoteForStudent(realTenantId, studentId, viewed);

    expect(result?.notes).toBe('Morning lesson, same day, earlier');
  });

  it('returns null when there is no completed lesson before the viewed lesson, even if a later completed lesson exists', async () => {
    if (!TEST_DATABASE_URL) return;

    const viewed = await makeLesson({ date: '2027-07-01', startTime: '09:00:00', status: 'completed', notes: 'First and only completed lesson so far' });
    await makeLesson({ date: '2027-07-15', startTime: '09:00:00', status: 'completed', notes: 'A later completed lesson' });

    const result = await lessonService.getLastCompletedLessonNoteForStudent(realTenantId, studentId, viewed);

    expect(result).toBeNull();
  });

  it('ignores a scheduled (non-completed) lesson that happened earlier, since it never actually happened', async () => {
    if (!TEST_DATABASE_URL) return;

    await makeLesson({ date: '2027-08-01', startTime: '09:00:00', status: 'cancelled', notes: 'Cancelled, should never show' });
    const viewed = await makeLesson({ date: '2027-08-15', startTime: '09:00:00', status: 'completed', notes: 'Viewed lesson' });

    const result = await lessonService.getLastCompletedLessonNoteForStudent(realTenantId, studentId, viewed);

    expect(result).toBeNull();
  });
});

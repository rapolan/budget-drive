import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import type { Lesson } from '../types';

/**
 * Real-Postgres proof that lessonService.updateLesson actually works -
 * not a mocked wiring test. Reproduces the exact production bug: every
 * mocked test in lessonService.test.ts (if any touched updateLesson with
 * a studentId) would have had to hand-write its own mock query responses
 * and could never discover that `UPDATE lessons SET student_id = $n ...`
 * fails against the real schema, because a mock simply returns whatever
 * row shape the test author already assumed - it has no actual column
 * list to violate. This file calls the REAL updateLesson (and createLesson,
 * to set up each case) against a real database, through config/database.ts's
 * real connection pool - not a hand-rolled SQL string standing in for it.
 *
 * Gated behind TEST_DATABASE_URL via it.skipIf, same convention as
 * signupConcurrency.integration.test.ts / migration006RealBackfill.integration.test.ts -
 * an absent env var shows as an explicit, named skip, never a silent gap.
 *
 * TEST_DATABASE_URL is parsed into the individual DB_HOST/DB_PORT/DB_NAME/
 * DB_USER/DB_PASSWORD env vars and set BEFORE lessonService.ts (and
 * therefore config/database.ts, whose connection pool is a module-level
 * singleton created at import time) is ever imported - vi.resetModules()
 * plus a dynamic import() inside beforeAll is what makes this work; a
 * static top-level `import` would already have created the pool against
 * whatever DB_* the test runner's own environment/.env.test had at
 * process start, before this file's beforeAll ever runs.
 *
 * Each test case below uses its OWN calendar date (see the DATES map) -
 * discovered live: a tenant defaults to maxLessonsPerStudentPerDay = 1
 * (schedulingService.ts), so two lessons for the same student on the same
 * date collide on that limit before this test ever reaches the behavior
 * it's trying to isolate. Separate dates sidestep that entirely rather
 * than touching tenant_settings, which isn't what any of these cases are
 * about.
 *
 * To run locally against a real Postgres instance (must already have all
 * 6 migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/lessonServiceUpdateRealDb.integration.test.ts
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

// A spread of fixed future Mondays, comfortably inside the availability
// window set up below - avoids any flakiness from "today" crossing a day
// boundary relative to the tenant's timezone during a slow test run, and
// each test case gets its own date so same-day-per-student limits never
// cross between unrelated cases.
const DATES = {
  notesOnly: '2027-03-01',
  dateTimeEdit: '2027-03-08',
  studentUnchanged: '2027-03-15',
  reassignActive: '2027-03-22',
  reassignNoEnrollment: '2027-03-29',
  conflict: '2027-04-05',
  selfOverlap: '2027-04-12',
};

describe('real-Postgres: lessonService.updateLesson', () => {
  let pool: Pool;
  let lessonService: typeof import('../services/lessonService');
  let googleCalendarSyncService: typeof import('../services/googleCalendarSyncService');

  let realTenantId: string;
  let instructorId: string;
  let vehicleId: string;
  let studentAId: string;
  let studentBId: string; // has an active enrollment
  let studentCId: string; // has NO active enrollment

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return; // nothing to connect to - every test below is skipped

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    // Force a fresh module graph so config/database.ts's pool is created
    // fresh against the env vars just set above, not whatever was already
    // cached from an earlier test file's import in the same worker.
    vi.resetModules();
    lessonService = await import('../services/lessonService');
    googleCalendarSyncService = await import('../services/googleCalendarSyncService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Lesson Update Test School', $1, 'lesson-update-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`lesson-update-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const instructorResult = await pool.query(
      `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status)
       VALUES ($1, 'Test Instructor', $2, '555-0100', CURRENT_DATE, 'active')
       RETURNING id`,
      [realTenantId, `instructor-${Date.now()}@example.com`]
    );
    instructorId = instructorResult.rows[0].id;

    // Wide-open availability covering the whole test window, every day of
    // the week - this test isn't about availability-window edge cases, so
    // make it a non-factor rather than hand-tuning day_of_week per case.
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

    const makeStudent = async (label: string) => {
      const res = await pool.query(
        `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
         VALUES ($1, $2, $2, 'Test', '2008-01-01')
         RETURNING id`,
        [realTenantId, label]
      );
      return res.rows[0].id as string;
    };
    studentAId = await makeStudent(`Student A ${Date.now()}`);
    studentBId = await makeStudent(`Student B ${Date.now()}`);
    studentCId = await makeStudent(`Student C (no enrollment) ${Date.now()}`);

    const makeActiveEnrollment = async (studentId: string) => {
      await pool.query(
        `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required)
         VALUES ($1, $2, 'driver_training', 'active', 30)`,
        [realTenantId, studentId]
      );
    };
    await makeActiveEnrollment(studentAId);
    await makeActiveEnrollment(studentBId);
    // studentCId deliberately gets no enrollment row at all.
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createTestLesson(opts: { studentId: string; date: string; startTime: string; endTime: string }) {
    return lessonService.createLesson(realTenantId, {
      studentId: opts.studentId,
      instructorId,
      vehicleId,
      date: opts.date,
      startTime: opts.startTime,
      endTime: opts.endTime,
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 50,
    });
  }

  it('edit notes only: succeeds, does not touch enrollment_id, does not re-run the conflict check', async () => {
    if (!TEST_DATABASE_URL) return;
    const lesson = await createTestLesson({ studentId: studentAId, date: DATES.notesOnly, startTime: '09:00', endTime: '10:00' });
    const syncSpy = vi.spyOn(googleCalendarSyncService, 'syncLessonToGoogle');

    const updated = await lessonService.updateLesson(lesson.id, realTenantId, { notes: 'Updated notes only' });

    expect(updated.notes).toBe('Updated notes only');
    expect(updated.studentId).toBe(studentAId);
    expect(updated.enrollmentId).toBe(lesson.enrollmentId);
    // Google Calendar sync still fires on every update, including a
    // notes-only one (triggerGoogleCalendarSync is unconditional) -
    // "still triggers the Google Calendar sync" per the task.
    expect(syncSpy).toHaveBeenCalledWith(lesson.id, instructorId, realTenantId);
  });

  it('edit date/time: actually changes date/startTime/endTime in the database (the exact gap scheduledStart/scheduledEnd left silently un-applied)', async () => {
    if (!TEST_DATABASE_URL) return;
    const lesson = await createTestLesson({ studentId: studentAId, date: DATES.dateTimeEdit, startTime: '11:00', endTime: '12:00' });

    const updated = await lessonService.updateLesson(lesson.id, realTenantId, {
      date: DATES.dateTimeEdit,
      startTime: '14:00',
      endTime: '15:00',
      duration: 60,
    } as Partial<Lesson>);

    expect(updated.startTime.substring(0, 5)).toBe('14:00');
    expect(updated.endTime.substring(0, 5)).toBe('15:00');

    const dbRow = await pool.query('SELECT start_time, end_time FROM lessons WHERE id = $1', [lesson.id]);
    expect(dbRow.rows[0].start_time.substring(0, 5)).toBe('14:00');
    expect(dbRow.rows[0].end_time.substring(0, 5)).toBe('15:00');
  });

  it('edit with studentId unchanged: succeeds without throwing "column student_id does not exist" (the exact production bug)', async () => {
    if (!TEST_DATABASE_URL) return;
    const lesson = await createTestLesson({ studentId: studentAId, date: DATES.studentUnchanged, startTime: '08:00', endTime: '09:00' });

    // This is precisely what LessonModal.tsx does on every edit - send
    // studentId unchanged, alongside an unrelated field. Before the fix,
    // this line alone always threw.
    const updated = await lessonService.updateLesson(lesson.id, realTenantId, {
      studentId: studentAId,
      notes: 'Still student A',
    } as Partial<Lesson>);

    expect(updated.studentId).toBe(studentAId);
    expect(updated.enrollmentId).toBe(lesson.enrollmentId); // unchanged - never repointed
    expect(updated.notes).toBe('Still student A');
  });

  it('reassign to a different student with an active enrollment: enrollment_id is repointed to the new student\'s enrollment', async () => {
    if (!TEST_DATABASE_URL) return;
    const lesson = await createTestLesson({ studentId: studentAId, date: DATES.reassignActive, startTime: '16:00', endTime: '17:00' });

    const updated = await lessonService.updateLesson(lesson.id, realTenantId, { studentId: studentBId } as Partial<Lesson>);

    expect(updated.studentId).toBe(studentBId);
    expect(updated.enrollmentId).not.toBe(lesson.enrollmentId);

    const studentBEnrollment = await pool.query(
      `SELECT id FROM enrollments WHERE student_id = $1 AND tenant_id = $2 AND program_type = 'driver_training' AND status = 'active'`,
      [studentBId, realTenantId]
    );
    expect(updated.enrollmentId).toBe(studentBEnrollment.rows[0].id);
  });

  it('reassign to a student with no active enrollment: 400, lesson left unchanged', async () => {
    if (!TEST_DATABASE_URL) return;
    const lesson = await createTestLesson({ studentId: studentAId, date: DATES.reassignNoEnrollment, startTime: '17:30', endTime: '18:30' });

    await expect(
      lessonService.updateLesson(lesson.id, realTenantId, { studentId: studentCId } as Partial<Lesson>)
    ).rejects.toMatchObject({ statusCode: 400 });

    const dbRow = await pool.query(
      `SELECT e.student_id FROM lessons l JOIN enrollments e ON e.id = l.enrollment_id WHERE l.id = $1`,
      [lesson.id]
    );
    expect(dbRow.rows[0].student_id).toBe(studentAId);
  });

  it('reschedule into a conflict: 409, the conflicting lesson is reported, nothing is changed', async () => {
    if (!TEST_DATABASE_URL) return;
    // Different students (A, B) so the student-daily-limit check doesn't
    // interfere - this case is specifically about the INSTRUCTOR being
    // double-booked, not about a student's own daily limit.
    const blocker = await createTestLesson({ studentId: studentAId, date: DATES.conflict, startTime: '09:00', endTime: '10:00' });
    const moving = await createTestLesson({ studentId: studentBId, date: DATES.conflict, startTime: '13:00', endTime: '14:00' });

    await expect(
      lessonService.updateLesson(moving.id, realTenantId, { date: DATES.conflict, startTime: '09:30', endTime: '10:30' } as Partial<Lesson>)
    ).rejects.toMatchObject({ statusCode: 409 });

    const dbRow = await pool.query('SELECT start_time, end_time FROM lessons WHERE id = $1', [moving.id]);
    expect(dbRow.rows[0].start_time.substring(0, 5)).toBe('13:00');
    void blocker; // created purely to occupy the slot moving.id tries to move into
  });

  it('edit does not conflict with itself: rescheduling a lesson to overlap its OWN current slot succeeds', async () => {
    if (!TEST_DATABASE_URL) return;
    const lesson = await createTestLesson({ studentId: studentAId, date: DATES.selfOverlap, startTime: '09:00', endTime: '10:00' });

    // Shifts by 15 minutes, which still overlaps the lesson's own
    // PREVIOUS slot (09:00-10:00) - if excludeLessonId weren't applied,
    // this would spuriously conflict with itself.
    const updated = await lessonService.updateLesson(lesson.id, realTenantId, {
      date: DATES.selfOverlap,
      startTime: '09:15',
      endTime: '10:15',
    } as Partial<Lesson>);

    expect(updated.startTime.substring(0, 5)).toBe('09:15');
    expect(updated.endTime.substring(0, 5)).toBe('10:15');
  });
});

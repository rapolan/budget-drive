import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const tenYearsAgo = new Date();
tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

describe('GET /api/v1/students - progress attachment', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  const ENROLLMENT_ID = '77777777-7777-7777-7777-777777777777';

  it('attaches computed progress to every student in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // getAllStudents: count, student rows, then attachProgress's own
    // sequence - tenant settings, active driver_training enrollments batch,
    // lessons for those enrollments, guardian counts.
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])
    ); // active driver_training enrollments batch
    mockQuery.mockResolvedValueOnce(
      queryResult([{ enrollment_id: ENROLLMENT_ID, status: 'completed', duration: 270, cost: 150 }])
    ); // lessons for those enrollments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched payments for those enrollments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts (minor, none linked)

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.progress).toBeDefined();
    expect(student.progress.track).toBe('hours');
    expect(student.progress.hoursCompleted).toBe(4.5);

    const lessonsCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM lessons')
    );
    expect(lessonsCall).toBeDefined();
    const [, params] = lessonsCall!;
    expect(params[0]).toBe(TENANT_ID);
    expect(params[1]).toEqual([ENROLLMENT_ID]);
  });

  // Regression: the Students list's History column (AuditColumn) reads
  // student.createdByName/updatedByName, but getAllStudents never resolved
  // those from created_by/updated_by - the column always fell back to
  // "Unknown" for every student, seeded or not, because the field was
  // simply never present on the response.
  it('resolves createdByName/updatedByName from a users join in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        date_of_birth: tenYearsAgo.toISOString(),
        created_by_name: 'System Admin',
        updated_by_name: 'System Admin',
      }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // active driver_training enrollments batch (none)
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts (minor, none linked)

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].createdByName).toBe('System Admin');
    expect(res.body.data[0].updatedByName).toBe('System Admin');

    const studentsCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM students') && sql.includes('LEFT JOIN')
    );
    expect(studentsCall).toBeDefined();
    const [studentsSql] = studentsCall!;
    expect(studentsSql).toMatch(/LEFT JOIN users/i);
    expect(studentsSql).toMatch(/created_by_name/i);
    expect(studentsSql).toMatch(/updated_by_name/i);
  });

  it('createdByName/updatedByName are null (not "Unknown" server-side) when the audit user has no name to resolve', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        date_of_birth: tenYearsAgo.toISOString(),
        created_by_name: null,
        updated_by_name: null,
      }])
    ); // student rows - e.g. created_by was never set (older/seed data)
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // active driver_training enrollments batch (none)
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts (minor, none linked)

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].createdByName).toBeNull();
    expect(res.body.data[0].updatedByName).toBeNull();
  });

  it('attaches computed progress to a single student detail response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // getStudentById: student row, tenant settings (age calc), guardian
    // counts (minor), enrollments for student, then
    // attachProgressAndPayments' own tenant settings + lessons + payments.
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // guardian counts (minor, none linked)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])
    ); // enrollments for student
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (attachProgressAndPayments)
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for enrollment (none)
    mockQuery.mockResolvedValueOnce(queryResult([])); // payments for enrollment (none)

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBeDefined();
    expect(res.body.data.progress.track).toBe('hours');
    expect(res.body.data.progress.hoursCompleted).toBe(0);
  });

  it('resolves createdByName/updatedByName from a users join in the detail response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        date_of_birth: tenYearsAgo.toISOString(),
        created_by_name: 'System Admin',
        updated_by_name: 'System Admin',
      }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // guardian counts (minor, none linked)
    mockQuery.mockResolvedValueOnce(queryResult([])); // enrollments for student (none)

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.createdByName).toBe('System Admin');
    expect(res.body.data.updatedByName).toBe('System Admin');

    const studentCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM students')
    );
    expect(studentCall).toBeDefined();
    const [studentSql] = studentCall!;
    expect(studentSql).toMatch(/LEFT JOIN users/i);
    expect(studentSql).toMatch(/created_by_name/i);
    expect(studentSql).toMatch(/updated_by_name/i);
  });

  // Regression coverage: a completed driver_training enrollment previously
  // vanished from the list entirely (getActiveDriverTrainingEnrollmentsBatch
  // only ever matched status = 'active'), so activeEnrollment came back
  // null and studentStatus.ts's `if (!activeEnrollment)` branch fired
  // before the `if (activeEnrollment.completed)` branch could ever be
  // reached - "Completed" was unreachable for the case it exists to
  // describe. getDisplayDriverTrainingEnrollmentsBatch now resolves the
  // active enrollment if one exists, else falls back to the most recently
  // completed one.
  it('a student whose only driver_training enrollment is completed still shows a completed enrollment in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');
    const completedAt = new Date('2026-08-01T00:00:00.000Z');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'completed',
        hours_required: 6,
        completed: true,
        completed_at: completedAt.toISOString(),
        completion_reason: 'Finished all required hours',
      }])
    ); // getDisplayDriverTrainingEnrollmentsBatch - resolves the completed enrollment, not null
    mockQuery.mockResolvedValueOnce(
      queryResult([{ enrollment_id: ENROLLMENT_ID, status: 'completed', duration: 360, cost: 300 }])
    ); // lessons for that enrollment
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched payments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.activeEnrollment).not.toBeNull();
    expect(student.activeEnrollment.completed).toBe(true);
    expect(student.activeEnrollment.status).toBe('completed');
    expect(student.progress.track).toBe('completed');
  });

  // Follow-up regression coverage: withdrawn/inactive/suspended have the
  // identical bug as completed did - getActiveDriverTrainingEnrollmentsBatch's
  // literal status = 'active' filter meant NONE of these three ever
  // reached the student list either, so studentStatus.ts's dedicated
  // branches for them were unreachable. getDisplayDriverTrainingEnrollmentsBatch's
  // WHERE clause was widened to consider every status, not just active/completed.
  it('a student whose only driver_training enrollment is withdrawn shows it in the list response, with the withdrawal reason', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'withdrawn',
        hours_required: 6,
        completed: false,
        completed_at: null,
        completion_reason: null,
        withdrawn_reason: 'Moved out of state',
      }])
    ); // getDisplayDriverTrainingEnrollmentsBatch - resolves the withdrawn enrollment, not null
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for that enrollment
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched payments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.activeEnrollment).not.toBeNull();
    expect(student.activeEnrollment.status).toBe('withdrawn');
    expect(student.activeEnrollment.withdrawnReason).toBe('Moved out of state');
  });

  it('a student whose only driver_training enrollment is inactive shows it in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'inactive',
        hours_required: 6,
        completed: false,
        completed_at: null,
        completion_reason: null,
        withdrawn_reason: null,
      }])
    ); // getDisplayDriverTrainingEnrollmentsBatch - resolves the inactive enrollment, not null
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for that enrollment
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched payments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.activeEnrollment).not.toBeNull();
    expect(student.activeEnrollment.status).toBe('inactive');
  });

  it('a student whose only driver_training enrollment is suspended shows it in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'suspended',
        hours_required: 6,
        completed: false,
        completed_at: null,
        completion_reason: null,
        withdrawn_reason: null,
      }])
    ); // getDisplayDriverTrainingEnrollmentsBatch - resolves the suspended enrollment, not null
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for that enrollment
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched payments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.activeEnrollment).not.toBeNull();
    expect(student.activeEnrollment.status).toBe('suspended');
  });

  it('a student with no driver_training enrollment at all still shows activeEnrollment: null (No Active Enrollment)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // getDisplayDriverTrainingEnrollmentsBatch - no rows at all
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.activeEnrollment).toBeNull();
    expect(student.progress).toBeUndefined();
  });

  it('a returning student with a completed enrollment AND a new active one shows the active enrollment, not the completed one', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');
    const NEW_ENROLLMENT_ID = '88888888-8888-8888-8888-888888888888';

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    // getDisplayDriverTrainingEnrollmentsBatch's own SQL prioritizes
    // status = 'active' over completed_at DESC - the mock only needs to
    // return the row the real query would resolve to (the active one),
    // since this test exercises the service's consumption of that result,
    // not the SQL's own ORDER BY (verified separately, live, against the
    // real database - see the session's manual reproduction).
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: NEW_ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'active',
        hours_required: 6,
        completed: false,
        completed_at: null,
        completion_reason: null,
      }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for the new enrollment
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched payments
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts

    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const student = res.body.data[0];
    expect(student.activeEnrollment.id).toBe(NEW_ENROLLMENT_ID);
    expect(student.activeEnrollment.status).toBe('active');
    expect(student.activeEnrollment.completed).toBe(false);
  });
});

// getStudentById (the single-student detail read) resolves its display
// enrollment independently, in-memory from getEnrollmentsForStudent's
// already-fetched list - same bug, same fix, separate code path (see
// studentService.getStudentById).
describe('GET /api/v1/students/:id - display enrollment resolution', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('a student whose only enrollment is completed shows it as activeEnrollment, not null', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const ONLY_ENROLLMENT_ID = '77777777-7777-7777-7777-777777777099';

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (age calc)
    mockQuery.mockResolvedValueOnce(queryResult([])); // guardian counts (minor, none linked)
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ONLY_ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'completed',
        hours_required: 6,
        completed: true,
        completed_at: completedAt.toISOString(),
        completion_reason: 'Finished all required hours',
      }])
    ); // getEnrollmentsForStudent
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (attachProgressAndPayments)
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons
    mockQuery.mockResolvedValueOnce(queryResult([])); // payments

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.activeEnrollment).not.toBeNull();
    expect(res.body.data.activeEnrollment.completed).toBe(true);
    expect(res.body.data.progress.track).toBe('completed');
  });

  it('a student with no driver_training enrollment at all shows activeEnrollment: null', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // guardian counts
    mockQuery.mockResolvedValueOnce(queryResult([])); // getEnrollmentsForStudent - no rows

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.activeEnrollment).toBeNull();
    expect(res.body.data.progress).toBeUndefined();
  });

  it('a returning student with a completed enrollment AND a new active one shows the active enrollment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');
    const OLD_ENROLLMENT_ID = '77777777-7777-7777-7777-777777777001';
    const NEW_ENROLLMENT_ID = '77777777-7777-7777-7777-777777777002';

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: tenYearsAgo.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // guardian counts
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: OLD_ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'completed',
          hours_required: 6,
          completed: true,
          completed_at: '2025-01-01T00:00:00.000Z',
          completion_reason: 'Finished all required hours',
        },
        {
          id: NEW_ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
          completed_at: null,
          completion_reason: null,
        },
      ])
    ); // getEnrollmentsForStudent - both enrollments, old completed first
    // attachProgressAndPayments runs once for BOTH enrollments in this list
    // (getEnrollmentsForStudent attaches progress/paymentSummary to every
    // enrollment it returns, not just the resolved display one).
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for both enrollments
    mockQuery.mockResolvedValueOnce(queryResult([])); // payments for both enrollments

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.activeEnrollment.id).toBe(NEW_ENROLLMENT_ID);
    expect(res.body.data.activeEnrollment.status).toBe('active');
    expect(res.body.data.activeEnrollment.completed).toBe(false);
  });
});

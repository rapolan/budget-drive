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
});

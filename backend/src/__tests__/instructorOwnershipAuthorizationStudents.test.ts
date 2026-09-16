import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_A = '11111111-1111-1111-1111-111111111111';
const INSTRUCTOR_B = '22222222-2222-2222-2222-222222222222';

function signToken(userId: string, role?: string, instructorId?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role, instructorId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('instructor ownership checks on /api/v1/students', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor cannot list another instructor\'s students via GET /students/instructor/:instructorId', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    const res = await request(app)
      .get(`/api/v1/students/instructor/${INSTRUCTOR_B}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor listing their own students never sees payment/balance fields', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    // getStudentsByInstructor's SELECT
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'student-1', tenant_id: TENANT_ID, full_name: 'Jane Doe' }])
    );
    // attachProgress's batched payment-summary/fee-flag lookups (enough
    // empty results to satisfy whatever batched queries attachProgress runs)
    mockQuery.mockResolvedValue(queryResult([]));

    const res = await request(app)
      .get(`/api/v1/students/instructor/${INSTRUCTOR_A}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('paymentSummary');
    expect(res.body.data[0]).not.toHaveProperty('hasOutstandingFee');
    expect(res.body.data[0]).not.toHaveProperty('outstandingFeeAmount');
  });

  it('admin listing an instructor\'s students still sees payment/balance fields', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'student-1', tenant_id: TENANT_ID, full_name: 'Jane Doe' }])
    );
    mockQuery.mockResolvedValue(queryResult([]));

    const res = await request(app)
      .get(`/api/v1/students/instructor/${INSTRUCTOR_A}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('hasOutstandingFee');
    expect(res.body.data[0]).toHaveProperty('outstandingFeeAmount');
  });
});

describe('instructor ownership checks on /api/v1/instructors', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor cannot view another instructor\'s earnings', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_B}/earnings`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor cannot view another instructor\'s service areas', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_B}/service-areas`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor cannot edit service areas at all, even their own', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    // requireRole('owner','admin')'s fresh DB lookup: caller's membership is 'instructor'
    mockQuery.mockResolvedValueOnce(
      queryResult([{ role: 'instructor', status: 'active' }])
    );

    const res = await request(app)
      .put(`/api/v1/instructors/${INSTRUCTOR_A}/service-areas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ zipCodes: ['90210'] });

    expect(res.status).toBe(403);
  });
});

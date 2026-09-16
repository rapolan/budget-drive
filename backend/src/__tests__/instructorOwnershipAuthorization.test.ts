import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_A = '11111111-1111-1111-1111-111111111111';
const INSTRUCTOR_B = '22222222-2222-2222-2222-222222222222';
const LESSON_ID = '33333333-3333-3333-3333-333333333333';

function signToken(userId: string, role?: string, instructorId?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role, instructorId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('instructor ownership checks on /api/v1/lessons', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor cannot complete a lesson assigned to a different instructor', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    // lessonController's ownership check calls getLessonById first
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_B, status: 'scheduled' }])
    );

    const res = await request(app)
      .post(`/api/v1/lessons/${LESSON_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('instructor cannot mark another instructor\'s lesson as no-show', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_B, status: 'scheduled' }])
    );

    const res = await request(app)
      .post(`/api/v1/lessons/${LESSON_ID}/no-show`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('instructor cannot cancel another instructor\'s lesson', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_B, status: 'scheduled' }])
    );

    const res = await request(app)
      .post(`/api/v1/lessons/${LESSON_ID}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('instructor CAN complete their own assigned lesson', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    // 1. ownership check's getLessonById
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_A, status: 'scheduled' }])
    );
    // 2. assertLessonReviewable's own lookup inside lessonService.completeLesson
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_A, status: 'scheduled' }])
    );
    // 3. the UPDATE ... RETURNING that completeLesson issues
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_A, status: 'completed', student_id: 'student-1' }])
    );
    // 4. clearOutstandingFlagsForStudent's UPDATE (non-blocking, fire-and-forget)
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .post(`/api/v1/lessons/${LESSON_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('instructor cannot list another instructor\'s lessons via GET /lessons/instructor/:instructorId', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    const res = await request(app)
      .get(`/api/v1/lessons/instructor/${INSTRUCTOR_B}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor CAN list their own lessons via GET /lessons/instructor/:instructorId', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_A, status: 'scheduled' }])
    );

    const res = await request(app)
      .get(`/api/v1/lessons/instructor/${INSTRUCTOR_A}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin can still complete any lesson regardless of assigned instructor', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    // 1. ownership check's getLessonById (role !== 'instructor', so passes through unconditionally)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_B, status: 'scheduled' }])
    );
    // 2. assertLessonReviewable's lookup
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_B, status: 'scheduled' }])
    );
    // 3. the UPDATE ... RETURNING
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, instructor_id: INSTRUCTOR_B, status: 'completed', student_id: 'student-1' }])
    );
    // 4. clearOutstandingFlagsForStudent's UPDATE (non-blocking, fire-and-forget)
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .post(`/api/v1/lessons/${LESSON_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
  });
});

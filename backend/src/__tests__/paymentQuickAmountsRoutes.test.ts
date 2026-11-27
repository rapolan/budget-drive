import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ENROLLMENT_ID = '550e8400-e29b-41d4-a716-446655440002';

function signToken(userId: string, role?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function asRole(role: string) {
  mockQuery.mockResolvedValueOnce(queryResult([{ role, status: 'active' }]));
}

describe('GET /payments/student/:studentId/quick-amounts', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('staff can reach the endpoint (financial data is admin/staff territory)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');
    asRole('staff');
    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active enrollment
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, total_cost: null }])) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([])) // lessons
      .mockResolvedValueOnce(queryResult([{ total_paid: '0' }])); // net paid

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/quick-amounts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      nextLesson: null,
      scheduledLessons: null,
      completedUnpaidLessons: null,
      remainingCourse: null,
    });
  });

  it('instructor is rejected (403) - financial data is never instructor-visible', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor');
    asRole('instructor');

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/quick-amounts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('404s for a student not found in this tenant', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([])); // student check fails

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/quick-amounts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /payments/student/:studentId/duplicate-check', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns isDuplicate: false when no matching payment exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/duplicate-check`)
      .query({ amount: '50', paymentMethod: 'cash' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ isDuplicate: false, amount: null });
  });

  it('returns isDuplicate: true with the matched amount', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ amount: '50.00' }]));

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/duplicate-check`)
      .query({ amount: '50', paymentMethod: 'cash' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ isDuplicate: true, amount: 50 });
  });

  it('400s when amount or paymentMethod query params are missing', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'admin');
    asRole('admin');

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/duplicate-check`)
      .query({ amount: '50' }) // paymentMethod missing
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('staff can reach the endpoint', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');
    asRole('staff');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get(`/api/v1/payments/student/${STUDENT_ID}/duplicate-check`)
      .query({ amount: '50', paymentMethod: 'cash' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

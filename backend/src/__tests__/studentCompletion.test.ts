import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const ENROLLMENT_ID = '33333333-3333-3333-3333-333333333333';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('POST /api/v1/enrollments/:id/complete', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('marks an enrollment complete with an admin-supplied reason, stamping completed_by and a completion_hash', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);

    // requireRole's fresh lookup, then markEnrollmentCompleted's sequence:
    // getEnrollmentById, the person+guardian-count join, getTenantSettings
    // for age calc, then the completion UPDATE.
    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }])) // requireRole
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
        }])
      ) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([{ date_of_birth: adultDob.toISOString(), guardian_count: '0' }])) // person + guardian count join
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          completed: true,
          completed_at: new Date().toISOString(),
          completed_by: 'staff-1',
          completion_reason: 'Opted not to continue after turning 18',
          completion_hash: 'abc123',
          status: 'completed',
        }])
      );

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completionReason: 'Opted not to continue after turning 18' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.completed).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE enrollments')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/completed_at/);
    expect(sql).toMatch(/completed_by/);
    expect(sql).toMatch(/completion_reason/);
    expect(sql).toMatch(/completion_hash/);
    expect(sql).toMatch(/status = 'completed'/);
    expect(params).toContain('staff-1');
    expect(params).toContain('Opted not to continue after turning 18');
  });

  it('returns 404 for a nonexistent enrollment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }])) // requireRole
      .mockResolvedValueOnce(queryResult([])); // getEnrollmentById - not found

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/enrollments/:id/reopen', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('clears completion fields, resets status to active, and records reopenedBy/reopenedReason - requires a reason and owner/admin role', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }])) // requireRole
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          completed: true,
          completion_hash: 'abc123',
        }])
      ) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([{ count: '0' }])) // certificate existence check
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          completed: false,
          completed_at: null,
          completed_by: null,
          status: 'active',
          reopened_by: 'staff-1',
          reopened_reason: 'Booked by mistake',
          completion_hash: 'abc123', // survives the reopen, never cleared
        }])
      ); // the UPDATE

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Booked by mistake' });

    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(false);
    expect(res.body.data.completionHash).toBe('abc123');
    expect(res.body.data.certificateExists).toBe(false);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE enrollments')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/completed = false/);
    expect(sql).toMatch(/status = 'active'/);
    expect(sql).toMatch(/reopened_at/);
    expect(sql).toMatch(/reopened_by/);
    expect(sql).toMatch(/reopened_reason/);
    expect(sql).not.toMatch(/completion_hash = NULL/i);
    expect(params).toContain('Booked by mistake');
  });

  it('flags certificateExists=true when the student has an issued certificate', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'owner');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'owner', status: 'active' }])) // requireRole
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, completed: true }])
      ) // getEnrollmentById
      .mockResolvedValueOnce(queryResult([{ count: '1' }])) // certificate exists
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, completed: false, status: 'active' }])
      );

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong student' });

    expect(res.status).toBe(200);
    expect(res.body.data.certificateExists).toBe(true);
  });

  it('rejects reopen with no reason (400, before hitting requireRole/service)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }])); // requireRole still runs before validateRequired in this route's middleware order

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects reopen for a non-owner/admin role with 403', async () => {
    const { default: app } = await import('../app');
    const token = signToken('instructor-1', 'instructor');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }])); // requireRole rejects

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Test' });

    expect(res.status).toBe(403);
  });
});

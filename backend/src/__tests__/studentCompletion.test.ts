import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('POST /api/v1/students/:id/complete', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('marks a student complete with an admin-supplied reason, stamping completed_by', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);

    // markStudentCompleted's pre-check: getStudentById (student row +
    // attachProgress's batched lessons query; adult DOB so the guardian-count
    // batch query is skipped entirely, then a tenant-settings lookup for the
    // standard lesson length), then the completion UPDATE itself.
    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: STUDENT_ID,
          tenant_id: TENANT_ID,
          date_of_birth: adultDob.toISOString(),
          hours_required: 6,
          completed: false,
        }])
      )
      .mockResolvedValueOnce(queryResult([])) // batched lessons
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(
        queryResult([{
          id: STUDENT_ID,
          tenant_id: TENANT_ID,
          completed: true,
          completed_at: new Date().toISOString(),
          completed_by: 'staff-1',
          completion_reason: 'Opted not to continue after turning 18',
          status: 'completed',
        }])
      );

    const res = await request(app)
      .post(`/api/v1/students/${STUDENT_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completionReason: 'Opted not to continue after turning 18' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.completed).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/completed_at/);
    expect(sql).toMatch(/completed_by/);
    expect(sql).toMatch(/completion_reason/);
    expect(sql).toMatch(/status = 'completed'/);
    expect(params).toContain('staff-1');
    expect(params).toContain('Opted not to continue after turning 18');
  });

  it('returns 404 for a nonexistent student', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .post(`/api/v1/students/${STUDENT_ID}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/students/:id/reopen', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('clears completion fields and resets status to active', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        completed: false,
        completed_at: null,
        completed_by: null,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post(`/api/v1/students/${STUDENT_ID}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(false);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql] = updateCall!;
    expect(sql).toMatch(/completed = false/);
    expect(sql).toMatch(/status = 'active'/);
  });
});

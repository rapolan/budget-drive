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

  it('attaches computed progress to every student in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        date_of_birth: tenYearsAgo.toISOString(),
        hours_required: 6,
        completed: false,
      }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { student_id: STUDENT_ID, status: 'completed', duration: 270 },
      ])
    ); // batched lessons
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
    expect(params[1]).toEqual([STUDENT_ID]);
  });

  it('attaches computed progress to a single student detail response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        date_of_birth: tenYearsAgo.toISOString(),
        hours_required: 6,
        completed: false,
      }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched lessons (none)
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts (minor, none linked)

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toBeDefined();
    expect(res.body.data.progress.track).toBe('hours');
    expect(res.body.data.progress.hoursCompleted).toBe(0);
  });
});

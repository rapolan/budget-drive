import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_ID = '11111111-1111-1111-1111-111111111111';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression test for a 500 on instructor update: updateInstructor's UPDATE
// set updated_by, but the instructors table had no such column until
// migration 002 added it.
describe('PUT /api/v1/instructors/:id', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('updates an instructor and stamps updated_by with the caller', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        full_name: 'Updated Name',
        email: 'updated@example.com',
        status: 'active',
      }])
    );

    const res = await request(app)
      .put(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE instructors')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/updated_by/);
    expect(params).toContain('staff-1');
  });

  // Regression test: updateInstructor previously had no handling for
  // employmentType at all, so editing this field via the API silently did
  // nothing - the UPDATE never referenced employment_type.
  it('persists a change to employmentType', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        employment_type: 'independent_contractor',
      }])
    );

    const res = await request(app)
      .put(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ employmentType: 'independent_contractor' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE instructors')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/employment_type/);
    expect(params).toContain('independent_contractor');
  });
});

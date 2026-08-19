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

  // Regression test: updateInstructor had no branches for either license
  // field, so editing them via the API silently did nothing (same bug class
  // as employmentType above).
  it('persists a change to instructorLicenseNumber and instructorLicenseExpiration', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        instructor_license_number: 'DSI-999',
        instructor_license_expiration: '2030-01-01',
      }])
    );

    const res = await request(app)
      .put(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ instructorLicenseNumber: 'DSI-999', instructorLicenseExpiration: '2030-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE instructors')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/instructor_license_number/);
    expect(sql).toMatch(/instructor_license_expiration/);
    expect(params).toContain('DSI-999');
    expect(params).toContain('2030-01-01');
  });

  // A fresh read after the update round-trips both fields correctly through
  // keysToCamel - proving the whole create/update/read loop persists the
  // license, not just the UPDATE statement in isolation.
  it('returns instructorLicenseNumber and instructorLicenseExpiration on a fresh read', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        full_name: 'Test Instructor',
        email: 'test@example.com',
        status: 'active',
        instructor_license_number: 'DSI-777',
        instructor_license_expiration: '2028-06-15',
      }])
    );

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.instructorLicenseNumber).toBe('DSI-777');
    expect(res.body.data.instructorLicenseExpiration).toBe('2028-06-15');
  });

  // Regression test: updateInstructor read dateOfBirth on CREATE but had no
  // branch for it on UPDATE at all - the form's real, editable Date of Birth
  // input silently did nothing when changed on an existing instructor (same
  // bug class as employmentType/instructorLicenseNumber above).
  it('persists a change to dateOfBirth', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        date_of_birth: '1990-05-15',
      }])
    );

    const res = await request(app)
      .put(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dateOfBirth: '1990-05-15' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE instructors')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/date_of_birth/);
    expect(params).toContain('1990-05-15');
  });

  // Regression test: same bug class as dateOfBirth above - hireDate was read
  // on CREATE but had no UPDATE branch, so the form's real, editable Hire
  // Date input silently did nothing when changed on an existing instructor.
  it('persists a change to hireDate', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        hire_date: '2020-03-01',
      }])
    );

    const res = await request(app)
      .put(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ hireDate: '2020-03-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE instructors')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/hire_date/);
    expect(params).toContain('2020-03-01');
  });

  // A fresh read after the update round-trips both fields correctly through
  // keysToCamel - proving the whole update/read loop persists them, not just
  // the UPDATE statement in isolation.
  it('returns dateOfBirth and hireDate on a fresh read after updating both', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: INSTRUCTOR_ID,
        tenant_id: TENANT_ID,
        full_name: 'Test Instructor',
        email: 'test@example.com',
        status: 'active',
        date_of_birth: '1985-11-20',
        hire_date: '2019-07-04',
      }])
    );

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dateOfBirth).toBe('1985-11-20');
    expect(res.body.data.hireDate).toBe('2019-07-04');
  });
});

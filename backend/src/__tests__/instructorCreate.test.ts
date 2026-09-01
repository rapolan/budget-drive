import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression test for a 500 on instructor creation: the INSERT referenced
// created_by/updated_by columns that didn't exist on the instructors table.
// Migration 002 added them (matching lessons/students), and createInstructor
// now populates both from the authenticated caller's userId.
const formPayload = {
  fullName: 'Playwright Test Instructor',
  email: 'pw.test.instructor@example.com',
  phone: '555-0123',
  dateOfBirth: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
  instructorLicenseNumber: '',
  instructorLicenseExpiration: '',
  employmentType: 'w2_employee',
  hireDate: '2026-08-04',
  hourlyRate: 0,
  notes: '',
};

describe('POST /api/v1/instructors', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates an instructor with the form\'s exact payload shape', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'instructor-1',
        tenant_id: TENANT_ID,
        full_name: formPayload.fullName,
        email: formPayload.email,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/instructors')
      .set('Authorization', `Bearer ${token}`)
      .send(formPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructors')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;
    expect(sql).toMatch(/created_by/);
    expect(sql).toMatch(/updated_by/);
    // Both audit columns are set to the authenticated caller's id.
    expect(params).toContain('staff-1');
  });

  // Regression test: instructor_license_number/instructor_license_expiration
  // already existed as columns on the instructors table, but createInstructor
  // never inserted either one - the form collected a license number and the
  // backend silently discarded it (same bug class as employmentType, fixed
  // in 4eb4258).
  it('persists instructorLicenseNumber and instructorLicenseExpiration', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'instructor-1',
        tenant_id: TENANT_ID,
        full_name: formPayload.fullName,
        email: formPayload.email,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/instructors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...formPayload,
        instructorLicenseNumber: 'DSI-123456',
        instructorLicenseExpiration: '2029-08-04',
      });

    expect(res.status).toBe(201);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructors')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;
    expect(sql).toMatch(/instructor_license_number/);
    expect(sql).toMatch(/instructor_license_expiration/);
    expect(params).toContain('DSI-123456');
    expect(params).toContain('2029-08-04');
  });

  // Phase 3 of the compliance-records arc: the DE classroom-teacher flag
  // and credential, deliberately separate columns from the BTW instructor
  // license above.
  it('persists isDeTeacher and the DE credential fields', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'instructor-1',
        tenant_id: TENANT_ID,
        full_name: formPayload.fullName,
        email: formPayload.email,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/instructors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...formPayload,
        isDeTeacher: true,
        deCredentialNumber: 'DE-CRED-1',
        deCredentialExpiration: '2028-01-01',
      });

    expect(res.status).toBe(201);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructors')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;
    expect(sql).toMatch(/is_de_teacher/);
    expect(sql).toMatch(/de_credential_number/);
    expect(sql).toMatch(/de_credential_expiration/);
    expect(params).toContain(true);
    expect(params).toContain('DE-CRED-1');
    expect(params).toContain('2028-01-01');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '66666666-6666-6666-6666-666666666666';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('emergency contact split first/last name fields', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates a student with split emergency contact first/last name fields', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, full_name: 'Minor Student', date_of_birth: '2015-01-01' }])
      ) // INSERT INTO students
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // createEnrollment's student-existence check
      .mockResolvedValueOnce(queryResult([])) // createEnrollment's getActiveDriverTrainingEnrollment pre-check
      .mockResolvedValueOnce(queryResult([])) // createEnrollment's getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training' }])) // INSERT INTO enrollments
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: '2015-01-01' }])) // getStudentById: student row
      .mockResolvedValueOnce(queryResult([])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // guardian counts
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])
      ) // enrollments for student
      .mockResolvedValueOnce(queryResult([])) // tenant settings (attachProgressAndPayments)
      .mockResolvedValueOnce(queryResult([])) // lessons for enrollment
      .mockResolvedValueOnce(queryResult([])); // payments for enrollment

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Minor Student',
        dateOfBirth: '2015-01-01',
        emergencyContactFirstName: 'Jane',
        emergencyContactLastName: 'Doe',
        emergencyContactPhone: '555-0100',
      });

    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;
    expect(sql).toMatch(/emergency_contact_first_name/);
    expect(sql).toMatch(/emergency_contact_last_name/);
    expect(params).toContain('Jane');
    expect(params).toContain('Doe');
  });

  it('updates only emergencyContactLastName without touching first name', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, emergency_contact_last_name: 'Smith' }])
    );

    const res = await request(app)
      .put(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyContactLastName: 'Smith' });

    expect(res.status).toBe(200);
    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/emergency_contact_last_name/);
    expect(sql).not.toMatch(/emergency_contact_first_name/);
    expect(params).toContain('Smith');
  });

  it('the INSERT no longer references the dropped legacy columns', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: '2015-01-01' }])) // INSERT INTO students
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // createEnrollment's student-existence check
      .mockResolvedValueOnce(queryResult([])) // createEnrollment's getActiveDriverTrainingEnrollment pre-check
      .mockResolvedValueOnce(queryResult([])) // createEnrollment's getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training' }])) // INSERT INTO enrollments
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: '2015-01-01' }])) // getStudentById: student row
      .mockResolvedValueOnce(queryResult([])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // guardian counts
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }])
      ) // enrollments for student
      .mockResolvedValueOnce(queryResult([])) // tenant settings (attachProgressAndPayments)
      .mockResolvedValueOnce(queryResult([])) // lessons for enrollment
      .mockResolvedValueOnce(queryResult([])); // payments for enrollment

    await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Test Student', dateOfBirth: '2015-01-01', phone: '555-0100' });

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    const [sql] = insertCall!;
    expect(sql).not.toMatch(/emergency_contact,/);
    expect(sql).not.toMatch(/emergency_contact_name/);
    expect(sql).not.toMatch(/emergency_contact_2_name/);
  });
});

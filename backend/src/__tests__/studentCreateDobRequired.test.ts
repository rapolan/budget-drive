import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, mockGetClient, mockClientQuery, resetMockClient } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const basePayload = {
  fullName: 'Test Student',
  email: 'test.student@example.com',
  phone: '555-0100',
};

describe('POST /api/v1/students - date of birth required', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('rejects a missing dateOfBirth before touching the database', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(basePayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dateOfBirth/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an empty-string dateOfBirth', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, dateOfBirth: '' });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts a valid dateOfBirth', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1', default_hours_required: 6 }],
      rowCount: 1,
    }); // getTenantSettings (age check, pre-transaction)

    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // duplicate-email check
      .mockResolvedValueOnce({
        rows: [{ id: 'student-1', tenant_id: TENANT_ID, date_of_birth: '2010-01-01' }],
        rowCount: 1,
      }) // INSERT INTO students
      .mockResolvedValueOnce({ rows: [{ id: 'enrollment-1', student_id: 'student-1', program_type: 'driver_training' }], rowCount: 1 }) // INSERT INTO enrollments
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    // getStudentById re-fetch at the end of createStudent
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'student-1', tenant_id: TENANT_ID, date_of_birth: '2010-01-01' }], rowCount: 1 }); // student row
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // tenant settings
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // guardian counts (minor)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'enrollment-1', student_id: 'student-1', tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, completed: false }],
      rowCount: 1,
    }); // enrollments for student
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // tenant settings (attachProgressAndPayments)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // lessons for enrollment
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // payments for enrollment

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, dateOfBirth: '2010-01-01' });

    expect(res.status).toBe(201);
  });
});

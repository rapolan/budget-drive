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

// Regression test for a 500 on student creation: the `students` table has a
// NOT NULL `license_type` column, but the create form never collects or
// sends a `licenseType` field. This is the exact payload shape
// StudentModal.tsx sends on submit (no licenseType key at all).
const formPayload = {
  fullName: 'Test Repro Student',
  firstName: 'Test',
  lastName: 'Repro',
  middleName: '',
  email: 'test.repro@example.com',
  phone: '555-0100',
  dateOfBirth: '2010-01-01',
  address: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
  emergencyContactFirstName: '',
  emergencyContactLastName: '',
  emergencyContactPhone: '',
  emergencyContact2FirstName: '',
  emergencyContact2LastName: '',
  emergencyContact2Phone: '',
  hoursRequired: 6,
  learnerPermitNumber: '',
  learnerPermitIssueDate: '',
  learnerPermitExpiration: '',
  notes: '',
};

describe('POST /api/v1/students', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates a student when licenseType is omitted from the form payload', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // 1. duplicate-email check inside studentService.createStudent
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 2. the INSERT itself
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'student-1',
        tenant_id: TENANT_ID,
        full_name: formPayload.fullName,
        email: formPayload.email,
        license_type: 'car',
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(formPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    expect(insertCall).toBeDefined();
    const [, params] = insertCall!;
    // license_type must never be omitted/null — the DB column is NOT NULL
    // with a CHECK constraint, and the form never collects this field.
    expect(params).toContain('car');
  });
});

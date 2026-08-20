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

// Regression test for a 500 on student creation: the `enrollments` table
// (license_type moved here from students per the person/enrollment
// refactor) has a NOT NULL `license_type` column, but the create form never
// collects or sends a `licenseType` field. This is the exact payload shape
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

  it('creates a student and initial driver_training enrollment when licenseType is omitted from the form payload', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // 1. getTenantSettings (age check, resolves the tenant's timezone)
      .mockResolvedValueOnce(queryResult([])) // 2. duplicate-email check inside studentService.createStudent
      .mockResolvedValueOnce(
        queryResult([{
          id: 'student-1',
          tenant_id: TENANT_ID,
          full_name: formPayload.fullName,
          email: formPayload.email,
          date_of_birth: formPayload.dateOfBirth,
        }])
      ) // 3. INSERT INTO students
      .mockResolvedValueOnce(queryResult([{ id: 'student-1' }])) // 4. createEnrollment's student-existence check
      .mockResolvedValueOnce(queryResult([])) // 5. createEnrollment's getActiveDriverTrainingEnrollment pre-check - none yet
      .mockResolvedValueOnce(queryResult([])) // 6. createEnrollment's getTenantSettings (default hours)
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: 'student-1', tenant_id: TENANT_ID, program_type: 'driver_training', license_type: 'car', status: 'active' }])
      ) // 7. INSERT INTO enrollments
      // 6-11: the getStudentById re-fetch at the end of createStudent
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID, full_name: formPayload.fullName, date_of_birth: formPayload.dateOfBirth }])) // student row
      .mockResolvedValueOnce(queryResult([])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // guardian counts (minor per DOB above)
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: 'student-1', tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active', hours_required: 6, license_type: 'car', completed: false }])
      ) // enrollments for student
      .mockResolvedValueOnce(queryResult([])) // tenant settings (attachProgressAndPayments)
      .mockResolvedValueOnce(queryResult([])) // lessons for enrollment
      .mockResolvedValueOnce(queryResult([])); // payments for enrollment

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(formPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const enrollmentInsertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO enrollments')
    );
    expect(enrollmentInsertCall).toBeDefined();
    const [, params] = enrollmentInsertCall!;
    // license_type must never be omitted/null on the enrollment - the DB
    // column is NOT NULL with a CHECK constraint, and the form never
    // collects this field.
    expect(params).toContain('car');
  });
});

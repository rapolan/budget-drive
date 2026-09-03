import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult, mockGetClient, mockClientQuery, resetMockClient } from './mocks/database';

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
    resetMockClient();
  });

  it('creates a student and initial driver_training enrollment when licenseType is omitted from the form payload', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);

    // Pre-transaction: getTenantSettings (age check, resolves the tenant's
    // timezone) - the only plain query() call before createStudent opens
    // its BEGIN/COMMIT transaction.
    mockQuery.mockResolvedValueOnce(queryResult([]));

    // Inside the transaction: duplicate-email check, INSERT INTO students,
    // INSERT INTO enrollments (driver_training, inlined directly - no
    // separate createEnrollment pre-checks since this bypasses that
    // function entirely, same as createStudentWithGuardian already did).
    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // duplicate-email check
      .mockResolvedValueOnce(
        queryResult([{
          id: 'student-1',
          tenant_id: TENANT_ID,
          full_name: formPayload.fullName,
          email: formPayload.email,
          date_of_birth: formPayload.dateOfBirth,
        }])
      ) // INSERT INTO students
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: 'student-1', tenant_id: TENANT_ID, program_type: 'driver_training', license_type: 'car', status: 'active' }])
      ) // INSERT INTO enrollments
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    // Post-COMMIT: the getStudentById re-fetch at the end of createStudent
    // (plain, non-transactional reads).
    mockQuery
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

    const enrollmentInsertCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO enrollments')
    );
    expect(enrollmentInsertCall).toBeDefined();
    const [, params] = enrollmentInsertCall!;
    // license_type must never be omitted/null on the enrollment - the DB
    // column is NOT NULL with a CHECK constraint, and the form never
    // collects this field.
    expect(params).toContain('car');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
  });

  it('creates a driver_education enrollment instead of driver_training when initialEnrollment is provided', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (pre-transaction)

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // duplicate-email check
      .mockResolvedValueOnce(
        queryResult([{ id: 'student-2', tenant_id: TENANT_ID, full_name: formPayload.fullName, date_of_birth: formPayload.dateOfBirth }])
      ) // INSERT INTO students
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-2', student_id: 'student-2', tenant_id: TENANT_ID, program_type: 'driver_education', de_delivery_mode: 'classroom' }])
      ) // INSERT INTO enrollments (driver_education, not driver_training)
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'student-2', tenant_id: TENANT_ID, full_name: formPayload.fullName, date_of_birth: formPayload.dateOfBirth }])) // student row
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings (age check)
      .mockResolvedValueOnce(queryResult([])) // guardian counts (minor per DOB)
      .mockResolvedValueOnce(queryResult([])) // getGuardiansForStudent (minor)
      .mockResolvedValueOnce(queryResult([])) // getOutstandingFlagsForStudent
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-2', student_id: 'student-2', tenant_id: TENANT_ID, program_type: 'driver_education', status: 'active', de_delivery_mode: 'classroom', completed: false }])
      ) // getEnrollmentsForStudent's own SELECT
      .mockResolvedValueOnce(queryResult([])) // attachProgressAndPayments's getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // attachProgressAndPayments's lessons query
      .mockResolvedValueOnce(queryResult([])) // attachProgressAndPayments's payments query
      .mockResolvedValueOnce(queryResult([])); // getClassroomAttendanceSummaries (this classroom DE enrollment has none yet)

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...formPayload, initialEnrollment: { programType: 'driver_education', deDeliveryMode: 'classroom' } });

    expect(res.status).toBe(201);

    const enrollmentInsertCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO enrollments')
    );
    expect(enrollmentInsertCall).toBeDefined();
    const [sql, params] = enrollmentInsertCall!;
    expect(sql).toContain("'driver_education'");
    expect(sql).not.toContain("'driver_training'");
    expect(params).toContain('classroom');
    // California classroom DE is 30 hours, never the BTW 6-hour default -
    // no tenant_settings row here, so the hardcoded ?? 30 fallback applies.
    expect(params).toContain(30);

    // Only ONE enrollment INSERT ever runs - never both driver_education
    // AND an auto driver_training enrollment.
    const enrollmentInserts = mockClientQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO enrollments')
    );
    expect(enrollmentInserts).toHaveLength(1);
  });

  it('uses the tenant-configured default_de_hours_required instead of 30 when set', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, default_de_hours_required: 24 }])); // getTenantSettings (pre-transaction)

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // duplicate-email check
      .mockResolvedValueOnce(
        queryResult([{ id: 'student-3', tenant_id: TENANT_ID, full_name: formPayload.fullName, date_of_birth: formPayload.dateOfBirth }])
      ) // INSERT INTO students
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-3', student_id: 'student-3', tenant_id: TENANT_ID, program_type: 'driver_education', de_delivery_mode: 'online' }])
      ) // INSERT INTO enrollments
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'student-3', tenant_id: TENANT_ID, full_name: formPayload.fullName, date_of_birth: formPayload.dateOfBirth }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-3', student_id: 'student-3', tenant_id: TENANT_ID, program_type: 'driver_education', status: 'active', de_delivery_mode: 'online', completed: false }])
      )
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...formPayload, initialEnrollment: { programType: 'driver_education', deDeliveryMode: 'online' } });

    expect(res.status).toBe(201);

    const enrollmentInsertCall = mockClientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO enrollments')
    );
    const [, params] = enrollmentInsertCall!;
    expect(params).toContain(24);
    expect(params).not.toContain(30);
  });
});

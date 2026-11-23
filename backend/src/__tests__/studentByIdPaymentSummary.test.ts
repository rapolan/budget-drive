import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const ENROLLMENT_ID = '77777777-7777-7777-7777-777777777777';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const adultDob = new Date();
adultDob.setFullYear(adultDob.getFullYear() - 30);

// Regression coverage for payments-actions: GET /students/:id previously
// never attached a top-level paymentSummary at all (only getAllStudents'
// batched attachProgress did, via combinePaymentSummaries) - a caller that
// fetches a single student by id (e.g. Payments.tsx resolving a "who owes
// you" row for a student not already in its own loaded list) got back a
// Student with paymentSummary undefined, breaking PaymentModal's amount
// pre-fill and PaymentHistoryModal's summary cards. Fixed by computing the
// same combined (BTW + DE) paymentSummary getStudentById already has the
// ingredients for in memory, from the enrollments list it already fetches -
// no new query.
describe('GET /api/v1/students/:id - paymentSummary attachment (payments-actions fix)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('attaches a combined paymentSummary computed from the driver_training enrollment already fetched', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (age calc - adult, guardian queries skipped)
    mockQuery.mockResolvedValueOnce(queryResult([])); // outstanding fees
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'active',
        hours_required: 6,
        completed: false,
        total_cost: '300.00',
      }])
    ); // enrollments for student
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (attachProgressAndPayments)
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for enrollment (none)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ enrollment_id: ENROLLMENT_ID, total_paid: '100.00' }])
    ); // payments for enrollment - $100 confirmed

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentSummary).toMatchObject({
      totalPaid: 100,
      outstandingBalance: 200,
      paymentStatus: 'partial',
      creditBalance: 0,
    });
  });

  it('combines BTW and DE paymentSummary into one figure, same as the list endpoint', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');
    const DE_ENROLLMENT_ID = '88888888-8888-8888-8888-888888888888';

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (age calc)
    mockQuery.mockResolvedValueOnce(queryResult([])); // outstanding fees
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
          total_cost: '300.00',
        },
        {
          id: DE_ENROLLMENT_ID,
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_education',
          status: 'active',
          completed: false,
          total_cost: '150.00',
        },
      ])
    ); // enrollments for student (both programs)
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons (none for either enrollment)
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { enrollment_id: ENROLLMENT_ID, total_paid: '100.00' },
        { enrollment_id: DE_ENROLLMENT_ID, total_paid: '150.00' },
      ])
    ); // payments - BTW partially paid, DE paid in full

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // BTW: 300 - 100 = 200 outstanding. DE: 150 - 150 = 0 outstanding, 0
    // credit. Combined: totalPaid 250, outstandingBalance 200.
    expect(res.body.data.paymentSummary).toMatchObject({
      totalPaid: 250,
      outstandingBalance: 200,
    });
  });

  it('returns paymentSummary: undefined (via combinePaymentSummaries) for a student with no enrollments at all, same as the list endpoint', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString() }])
    ); // student row
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings (age calc)
    mockQuery.mockResolvedValueOnce(queryResult([])); // outstanding fees
    mockQuery.mockResolvedValueOnce(queryResult([])); // enrollments for student (none)

    const res = await request(app)
      .get(`/api/v1/students/${STUDENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // combinePaymentSummaries(null, null) returns undefined, not an
    // 'unknown'-status object - correct existing behavior (studentService.ts),
    // reused here rather than invented: a student with no enrollments at
    // all has nothing to combine, same as what the list endpoint already
    // returns for this exact case.
    expect(res.body.data.paymentSummary).toBeUndefined();
  });
});

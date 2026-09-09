import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const BTW_ENROLLMENT_ID = '77777777-7777-7777-7777-777777777777';
const DE_ENROLLMENT_ID = '99999999-9999-9999-9999-999999999999';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const adultDob = new Date();
adultDob.setFullYear(adultDob.getFullYear() - 25);

/**
 * Item 4 of the DE-pricing task: a person's list-level paymentSummary
 * (Payments.tsx, the Add Payment modal's pre-fill) must combine BOTH
 * their BTW enrollment's balance AND their DE enrollment's balance - a
 * payment can now attach to either program's enrollment
 * (paymentService.createPayment), so a summary that only ever looked at
 * BTW would silently miss real DE debt/credit.
 */
describe('GET /api/v1/students - combined BTW + DE paymentSummary', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  function mockListSequence(opts: {
    btwEnrollment: Record<string, unknown> | null;
    btwLessons?: Record<string, unknown>[];
    deEnrollment: Record<string, unknown> | null;
    payments?: Record<string, unknown>[];
  }) {
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: adultDob.toISOString() }])
    ); // student rows
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])); // tenant settings
    mockQuery.mockResolvedValueOnce(queryResult(opts.btwEnrollment ? [opts.btwEnrollment] : [])); // getDisplayDriverTrainingEnrollmentsBatch
    mockQuery.mockResolvedValueOnce(queryResult(opts.deEnrollment ? [opts.deEnrollment] : [])); // getDeEnrollmentsBatch
    if (opts.deEnrollment?.de_delivery_mode === 'classroom') {
      mockQuery.mockResolvedValueOnce(queryResult([])); // getClassroomAttendanceSummaries (no attendance rows)
    }
    if (opts.btwEnrollment) {
      mockQuery.mockResolvedValueOnce(queryResult(opts.btwLessons ?? [])); // lessons for the BTW enrollment
    }
    if (opts.btwEnrollment || opts.deEnrollment) {
      mockQuery.mockResolvedValueOnce(queryResult(opts.payments ?? [])); // combined BTW+DE payments batch
    }
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched guardian counts
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched outstanding fees
    mockQuery.mockResolvedValueOnce(queryResult([])); // batched primary guardians
  }

  it('a DE-only student (no BTW enrollment) with a $150 DE cost and $0 paid shows outstandingBalance: 150', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockListSequence({
      btwEnrollment: null,
      deEnrollment: {
        id: DE_ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'active',
        completed: false,
        completed_at: null,
        de_delivery_mode: 'classroom',
        manual_completed_hours: null,
        total_cost: '150.00',
        cohort_name: null,
        certificate_id: null,
      },
      payments: [],
    });

    const res = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].paymentSummary).toEqual({
      totalPaid: 0,
      outstandingBalance: 150,
      paymentStatus: 'unpaid',
    });
  });

  it('a DE-only student who paid their $150 DE cost in full shows outstandingBalance: 0, status paid', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockListSequence({
      btwEnrollment: null,
      deEnrollment: {
        id: DE_ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'active',
        completed: false,
        completed_at: null,
        de_delivery_mode: 'online',
        manual_completed_hours: null,
        total_cost: '150.00',
        cohort_name: null,
        certificate_id: null,
      },
      payments: [{ enrollment_id: DE_ENROLLMENT_ID, total_paid: '150.00' }],
    });

    const res = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].paymentSummary).toEqual({
      totalPaid: 150,
      outstandingBalance: 0,
      paymentStatus: 'paid',
    });
  });

  it('a student with BOTH a BTW balance and a DE balance gets them summed into one total', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockListSequence({
      btwEnrollment: {
        id: BTW_ENROLLMENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'active',
        total_cost: '300.00',
      },
      btwLessons: [],
      deEnrollment: {
        id: DE_ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'active',
        completed: false,
        completed_at: null,
        de_delivery_mode: 'classroom',
        manual_completed_hours: null,
        total_cost: '150.00',
        cohort_name: null,
        certificate_id: null,
      },
      payments: [
        { enrollment_id: BTW_ENROLLMENT_ID, total_paid: '100.00' },
        { enrollment_id: DE_ENROLLMENT_ID, total_paid: '50.00' },
      ],
    });

    const res = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // BTW: 300 - 100 = 200 owed. DE: 150 - 50 = 100 owed. Combined: 300 paid... no:
    // totalPaid = 100 + 50 = 150; outstandingBalance = 200 + 100 = 300.
    expect(res.body.data[0].paymentSummary).toEqual({
      totalPaid: 150,
      outstandingBalance: 300,
      paymentStatus: 'partial',
    });
  });

  it('a student with neither a computable BTW total nor a DE enrollment gets paymentSummary: undefined', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockListSequence({
      btwEnrollment: null,
      deEnrollment: null,
    });

    const res = await request(app).get('/api/v1/students').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].paymentSummary).toBeUndefined();
  });
});

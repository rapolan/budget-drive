import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));
vi.mock('../services/Ledger', () => ({
  ledger: {
    enabled: false,
    anchorAction: vi.fn().mockResolvedValue({ txid: null, anchored: false, provider: 'noop', timestamp: '' }),
    recordPayment: vi.fn().mockResolvedValue({ txid: null, anchored: false, provider: 'noop', timestamp: '' }),
    issueCertificate: vi.fn().mockResolvedValue({ txid: null, anchored: false, provider: 'noop', timestamp: '' }),
    getStatus: vi.fn().mockResolvedValue({ enabled: false, provider: 'noop' }),
  },
}));

const TENANT_ID = 'tenant-abc';
const PAYMENT_ID = 'payment-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';

// A raw row exactly as Postgres would return it - snake_case, plus the
// join-derived student_id alias paymentService's queries add (see
// migration 020's lessons.student_id/payments.student_id drop).
const rawPaymentRow = {
  id: PAYMENT_ID,
  tenant_id: TENANT_ID,
  enrollment_id: ENROLLMENT_ID,
  student_id: STUDENT_ID,
  date: new Date('2026-08-01T00:00:00.000Z'),
  amount: '50.00',
  payment_method: 'cash',
  payment_type: 'lesson_payment',
  status: 'confirmed',
  confirmation_date: null,
  related_lesson_ids: null,
  invoice_id: null,
  bsv_transaction_id: null,
  receipt_sent: false,
  receipt_url: null,
  notes: null,
  coda_row_id: null,
  created_by: 'user-1',
  updated_by: 'user-1',
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-01T00:00:00.000Z'),
};

/**
 * Every paymentService function that returns a Payment (or Payment[]) must
 * apply keysToCamel, the way lessonService already does - the Payment type
 * declares camelCase fields (enrollmentId, paymentMethod, studentId, etc.),
 * and a raw snake_case row silently satisfies TypeScript's `as Payment`
 * cast while returning undefined for every camelCase read. This suite
 * exists to catch a regression back to that state, not to re-test business
 * logic already covered elsewhere.
 */
function expectCamelCasePayment(payment: any) {
  expect(payment.enrollmentId).toBe(ENROLLMENT_ID);
  expect(payment.studentId).toBe(STUDENT_ID);
  expect(payment.paymentMethod).toBe('cash');
  expect(payment.paymentType).toBe('lesson_payment');
  expect(payment.tenantId).toBe(TENANT_ID);
  expect(payment.bsvTransactionId).toBeNull();
  // Snake_case keys must not leak through onto the returned object.
  expect(payment.payment_method).toBeUndefined();
  expect(payment.student_id).toBeUndefined();
  expect(payment.enrollment_id).toBeUndefined();
}

describe('paymentService - keysToCamel applied at every return site', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('getAllPayments returns camelCase Payment objects', async () => {
    const { getAllPayments } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ count: '1' }]))
      .mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const result = await getAllPayments(TENANT_ID, 1, 50);
    expect(result.payments).toHaveLength(1);
    expectCamelCasePayment(result.payments[0]);
  });

  it('getPaymentById returns a camelCase Payment object', async () => {
    const { getPaymentById } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const payment = await getPaymentById(PAYMENT_ID, TENANT_ID);
    expect(payment).not.toBeNull();
    expectCamelCasePayment(payment);
  });

  it('getPaymentsByStudent returns camelCase Payment objects', async () => {
    const { getPaymentsByStudent } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const payments = await getPaymentsByStudent(TENANT_ID, STUDENT_ID);
    expect(payments).toHaveLength(1);
    expectCamelCasePayment(payments[0]);
  });

  it('getPaymentsByLesson returns camelCase Payment objects', async () => {
    const { getPaymentsByLesson } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const payments = await getPaymentsByLesson(TENANT_ID, 'lesson-1');
    expect(payments).toHaveLength(1);
    expectCamelCasePayment(payments[0]);
  });

  it('getPaymentsByStatus returns camelCase Payment objects', async () => {
    const { getPaymentsByStatus } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const payments = await getPaymentsByStatus(TENANT_ID, 'confirmed' as any);
    expect(payments).toHaveLength(1);
    expectCamelCasePayment(payments[0]);
  });

  it('getPaymentsByPaymentMethod returns camelCase Payment objects', async () => {
    const { getPaymentsByPaymentMethod } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const payments = await getPaymentsByPaymentMethod(TENANT_ID, 'cash');
    expect(payments).toHaveLength(1);
    expectCamelCasePayment(payments[0]);
  });

  it('createPayment returns a camelCase Payment object', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student existence check
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      ) // getActiveDriverTrainingEnrollment
      .mockResolvedValueOnce(queryResult([rawPaymentRow])); // INSERT ... RETURNING

    const payment = await createPayment(TENANT_ID, { studentId: STUDENT_ID, amount: 50 }, 'user-1');
    expectCamelCasePayment(payment);
  });

  it('updatePayment returns a camelCase Payment object', async () => {
    const { updatePayment } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([rawPaymentRow]));

    const payment = await updatePayment(PAYMENT_ID, TENANT_ID, { amount: 50 }, 'user-1');
    expectCamelCasePayment(payment);
  });

  it('markPaymentAsReceived returns a camelCase Payment object', async () => {
    const { markPaymentAsReceived } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([{ ...rawPaymentRow, status: 'confirmed' }]));

    const payment = await markPaymentAsReceived(PAYMENT_ID, TENANT_ID);
    expectCamelCasePayment(payment);
  });

  it('refundPayment returns a camelCase Payment object', async () => {
    const { refundPayment } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(queryResult([{ ...rawPaymentRow, status: 'refunded' }]));

    const payment = await refundPayment(PAYMENT_ID, TENANT_ID);
    expectCamelCasePayment(payment);
  });
});

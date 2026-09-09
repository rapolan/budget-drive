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
const STUDENT_ID = 'student-1';
const DE_ENROLLMENT_ID = 'de-enrollment-1';

/**
 * Driver Education now has a real course-fee balance (see
 * enrollmentDeDeliveryMode.test.ts's DE cost suite), but
 * paymentService.createPayment used to hard-require an active
 * driver_training enrollment - a DE-only student could never have a
 * payment recorded against them at all, making their DE balance
 * permanently unpayable. This widens createPayment to fall back to the
 * student's driver_education enrollment when there's no active BTW
 * enrollment, WITHOUT loosening validation for a student with neither -
 * that still 400s, since there's genuinely nothing to pay against.
 */
describe('paymentService.createPayment - DE enrollment fallback target', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('attaches to the driver_education enrollment when the student has no active driver_training enrollment', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // getActiveDriverTrainingEnrollment - none active
      .mockResolvedValueOnce(
        queryResult([{ id: DE_ENROLLMENT_ID, total_cost: '150.00', total_paid: '0' }])
      ) // DE enrollment lookup (outstanding balance)
      .mockResolvedValueOnce(
        queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, enrollment_id: DE_ENROLLMENT_ID }])
      ); // INSERT ... RETURNING

    await createPayment(TENANT_ID, { studentId: STUDENT_ID, amount: 150, paymentMethod: 'cash' }, 'user-1');

    const [, insertParams] = mockQuery.mock.calls[3];
    expect(insertParams).toContain(DE_ENROLLMENT_ID);
  });

  it('still 400s when the student has neither an active driver_training nor any driver_education enrollment', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // getActiveDriverTrainingEnrollment - none active
      .mockResolvedValueOnce(queryResult([])); // DE enrollment lookup - none at all

    await expect(
      createPayment(TENANT_ID, { studentId: STUDENT_ID, amount: 50, paymentMethod: 'cash' }, 'user-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('still 400s a lesson-linked payment when there is no active driver_training enrollment, even if a DE enrollment exists', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])); // getActiveDriverTrainingEnrollment - none active

    await expect(
      createPayment(
        TENANT_ID,
        { studentId: STUDENT_ID, amount: 50, paymentMethod: 'cash', lessonId: 'lesson-1' },
        'user-1'
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('prefers the active driver_training enrollment when one exists, even if a DE enrollment also exists', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(
        queryResult([{ id: 'btw-enrollment-1', tenant_id: TENANT_ID, student_id: STUDENT_ID, program_type: 'driver_training', status: 'active' }])
      ) // getActiveDriverTrainingEnrollment - active
      .mockResolvedValueOnce(
        queryResult([{ id: 'payment-2', tenant_id: TENANT_ID, enrollment_id: 'btw-enrollment-1' }])
      ); // INSERT ... RETURNING (no DE lookup query in between)

    await createPayment(TENANT_ID, { studentId: STUDENT_ID, amount: 50, paymentMethod: 'cash' }, 'user-1');

    const [, insertParams] = mockQuery.mock.calls[2];
    expect(insertParams).toContain('btw-enrollment-1');
  });
});

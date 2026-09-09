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
const ENROLLMENT_ID = 'enrollment-1';
const USER_ID = 'user-1';

/**
 * Regression coverage: paymentService.createPayment/updatePayment
 * referenced payments.created_by/updated_by in their INSERT/UPDATE
 * column lists, matching the created_by/updated_by pattern every other
 * audited table (students, lessons) already has - but no migration ever
 * added these two columns to payments. Every POST /payments hit a hard
 * Postgres 42703 (undefined_column) error until migration 029 added
 * them. This test guards the application-layer half: that createPayment/
 * updatePayment still build SQL referencing these columns going forward,
 * and that createPayment includes reference_number (migration 031) in
 * its INSERT alongside them.
 */
describe('paymentService.createPayment - audit columns + reference_number', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes created_by and updated_by in the INSERT column list and params', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student existence check
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      ) // getActiveDriverTrainingEnrollment
      .mockResolvedValueOnce(
        queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, enrollment_id: ENROLLMENT_ID, created_by: USER_ID, updated_by: USER_ID }])
      ); // INSERT ... RETURNING

    await createPayment(TENANT_ID, { studentId: STUDENT_ID, amount: 50, paymentMethod: 'cash' }, USER_ID);

    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/created_by/);
    expect(sql).toMatch(/updated_by/);
    expect(params).toContain(USER_ID);
  });

  it('includes reference_number in the INSERT when provided', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      )
      .mockResolvedValueOnce(
        queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, enrollment_id: ENROLLMENT_ID, reference_number: 'VENMO-4521' }])
      );

    await createPayment(
      TENANT_ID,
      { studentId: STUDENT_ID, amount: 50, paymentMethod: 'venmo', referenceNumber: 'VENMO-4521' },
      USER_ID
    );

    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/reference_number/);
    expect(params).toContain('VENMO-4521');
  });

  it('passes reference_number as null when not provided, never undefined', async () => {
    const { createPayment } = await import('../services/paymentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      )
      .mockResolvedValueOnce(queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, enrollment_id: ENROLLMENT_ID }]));

    await createPayment(TENANT_ID, { studentId: STUDENT_ID, amount: 50, paymentMethod: 'cash' }, USER_ID);

    const [, params] = mockQuery.mock.calls[2];
    expect(params).toContain(null);
    expect(params).not.toContain(undefined);
  });
});

describe('paymentService.updatePayment - updated_by and reference_number', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes updated_by when a userId is provided', async () => {
    const { updatePayment } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, enrollment_id: ENROLLMENT_ID, updated_by: USER_ID }])
    );

    await updatePayment('payment-1', TENANT_ID, { amount: 75 }, USER_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/updated_by\s*=\s*\$\d+/);
    expect(params).toContain(USER_ID);
  });

  it('includes reference_number in the UPDATE when provided', async () => {
    const { updatePayment } = await import('../services/paymentService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'payment-1', tenant_id: TENANT_ID, enrollment_id: ENROLLMENT_ID, reference_number: 'CHK-9981' }])
    );

    await updatePayment('payment-1', TENANT_ID, { referenceNumber: 'CHK-9981' } as any, USER_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/reference_number\s*=\s*\$\d+/);
    expect(params).toContain('CHK-9981');
  });
});

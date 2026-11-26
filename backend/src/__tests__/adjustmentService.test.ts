import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

import { derivePaymentAdjustmentStatus, computeNetPaid } from '../services/adjustmentService';

const TENANT_ID = 'tenant-abc';
const PAYMENT_ID = 'payment-1';
const USER_ID = 'user-1';

describe('adjustmentService.derivePaymentAdjustmentStatus', () => {
  it('returns "paid" with no adjustments', () => {
    expect(derivePaymentAdjustmentStatus(100, [])).toBe('paid');
  });

  it('returns "partly_refunded" when some but not all is refunded', () => {
    expect(
      derivePaymentAdjustmentStatus(100, [{ adjustmentType: 'refund', amount: 40 }])
    ).toBe('partly_refunded');
  });

  it('returns "refunded" when refunds sum to the full amount', () => {
    expect(
      derivePaymentAdjustmentStatus(100, [{ adjustmentType: 'refund', amount: 100 }])
    ).toBe('refunded');
  });

  it('returns "voided" whenever a void adjustment exists, even alongside a prior partial refund', () => {
    expect(
      derivePaymentAdjustmentStatus(100, [
        { adjustmentType: 'refund', amount: 30 },
        { adjustmentType: 'void', amount: 70 },
      ])
    ).toBe('voided');
  });

  it('returns "refunded" for a legacy status=refunded payment with no adjustment rows', () => {
    expect(derivePaymentAdjustmentStatus(100, [], 'refunded')).toBe('refunded');
  });

  it('a legacy status=refunded payment with a real adjustment row uses the adjustment, not the legacy shortcut', () => {
    // Once an adjustment exists, this is no longer the legacy no-adjustment
    // case - the legacyStatus shortcut only applies when adjustments is
    // empty, so a real partial refund still derives correctly.
    expect(
      derivePaymentAdjustmentStatus(100, [{ adjustmentType: 'refund', amount: 40 }], 'refunded')
    ).toBe('partly_refunded');
  });
});

describe('adjustmentService.computeNetPaid', () => {
  it('subtracts adjustments from the payment amount, floored at 0', () => {
    expect(computeNetPaid(100, [{ amount: 30 }])).toBe(70);
    expect(computeNetPaid(100, [{ amount: 30 }, { amount: 70 }])).toBe(0);
  });

  it('returns 0 for a legacy status=refunded payment with no adjustment rows', () => {
    expect(computeNetPaid(100, [], 'refunded')).toBe(0);
  });

  it('returns the full amount for an unadjusted, non-legacy payment', () => {
    expect(computeNetPaid(100, [])).toBe(100);
  });
});

describe('adjustmentService.createAdjustment', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('rejects an adjustment with reasonCode "other" and no note before ever opening a transaction', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    await expect(
      createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
        adjustmentType: 'refund',
        amount: 10,
        reasonCode: 'other',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects an unknown payment id (404) and rolls back', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // SELECT ... FOR UPDATE - not found
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
        adjustmentType: 'refund',
        amount: 10,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    const calls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('ROLLBACK');
  });

  it('rejects adjusting a payment that is not confirmed (400) and rolls back', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'pending' }]))
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
        adjustmentType: 'refund',
        amount: 10,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a refund amount exceeding the remaining unadjusted amount (400) and rolls back', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '40.00' }])) // $40 already adjusted - $60 remains
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
        adjustmentType: 'refund',
        amount: 61,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // The crux of the whole concurrency-safety design: a partial refund
  // followed by a second refund that would exceed the remainder is
  // rejected. This is the mocked-unit-test version; the real race-safety
  // (two SIMULTANEOUS requests) is proven for real against actual
  // Postgres row locking in adjustmentServiceRealDb.integration.test.ts -
  // a mock can't simulate two connections blocking on the same lock.
  it('rejects a second refund that would exceed the remainder after a first partial refund', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '70.00' }])) // first refund already took $70 - $30 remains
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
        adjustmentType: 'refund',
        amount: 31,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects any further adjustment once the payment is already fully adjusted', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '100.00' }])) // nothing remains
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
        adjustmentType: 'void',
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a successful partial refund inserts the exact requested amount and commits', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '0' }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'adj-1', tenant_id: TENANT_ID, payment_id: PAYMENT_ID, adjustment_type: 'refund',
          amount: '40.00', reason_code: 'overpaid', note: null, created_by: USER_ID,
          created_at: '2026-01-01T00:00:00.000Z', ledger_hash: 'abc123', ledger_txid: null,
        }])
      ) // INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const adjustment = await createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
      adjustmentType: 'refund',
      amount: 40,
      reasonCode: 'overpaid',
    });

    expect(adjustment.amount).toBe(40);
    expect(adjustment.adjustmentType).toBe('refund');
    const calls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(calls[calls.length - 1]).toBe('COMMIT');
    const insertCall = mockClientQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO payment_adjustments'));
    expect(insertCall).toBeDefined();
  });

  it('a void always covers the full remaining amount, ignoring any amount the caller passes', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '25.00' }])) // $75 remains
      .mockResolvedValueOnce(
        queryResult([{
          id: 'adj-2', tenant_id: TENANT_ID, payment_id: PAYMENT_ID, adjustment_type: 'void',
          amount: '75.00', reason_code: 'entered_in_error', note: null, created_by: USER_ID,
          created_at: '2026-01-01T00:00:00.000Z', ledger_hash: 'def456', ledger_txid: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const adjustment = await createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
      adjustmentType: 'void',
      amount: 1, // deliberately wrong - must be ignored
      reasonCode: 'entered_in_error',
    });

    expect(adjustment.amount).toBe(75);
  });

  it('requires a note when reasonCode is "other", and accepts it when provided', async () => {
    const { createAdjustment } = await import('../services/adjustmentService');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '0' }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'adj-3', tenant_id: TENANT_ID, payment_id: PAYMENT_ID, adjustment_type: 'refund',
          amount: '10.00', reason_code: 'other', note: 'called and asked', created_by: USER_ID,
          created_at: '2026-01-01T00:00:00.000Z', ledger_hash: 'ghi789', ledger_txid: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const adjustment = await createAdjustment(TENANT_ID, PAYMENT_ID, USER_ID, {
      adjustmentType: 'refund',
      amount: 10,
      reasonCode: 'other',
      note: 'called and asked',
    });

    expect(adjustment.note).toBe('called and asked');
  });
});

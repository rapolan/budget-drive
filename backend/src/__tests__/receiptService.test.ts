import { describe, it, expect } from 'vitest';
import { computeReceiptNumber } from '../services/receiptService';

describe('computeReceiptNumber', () => {
  it('is stable: the same (tenantId, paymentId) pair always produces the same receipt number', () => {
    const a = computeReceiptNumber('tenant-1', 'payment-1');
    const b = computeReceiptNumber('tenant-1', 'payment-1');
    expect(a).toBe(b);
  });

  it('produces different numbers for different payment ids under the same tenant', () => {
    const a = computeReceiptNumber('tenant-1', 'payment-1');
    const b = computeReceiptNumber('tenant-1', 'payment-2');
    expect(a).not.toBe(b);
  });

  it('produces different numbers for the same payment id under different tenants (tenant-scoped, never a bare lookup key)', () => {
    const a = computeReceiptNumber('tenant-1', 'payment-1');
    const b = computeReceiptNumber('tenant-2', 'payment-1');
    expect(a).not.toBe(b);
  });

  it('matches the documented "BDP-" + 10 uppercase hex characters format', () => {
    const receiptNumber = computeReceiptNumber('tenant-1', 'payment-1');
    expect(receiptNumber).toMatch(/^BDP-[0-9A-F]{10}$/);
  });
});

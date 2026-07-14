import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('NoopLedgerService', () => {
  let logInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { logger } = await import('../utils/logger');
    logInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    logInfoSpy.mockRestore();
  });

  it('anchorAction resolves txid: null, anchored: false, and logs', async () => {
    const { NoopLedgerService } = await import('../services/Ledger/NoopLedgerService');
    const svc = new NoopLedgerService();

    const result = await svc.anchorAction({
      tenantId: 'tenant-1',
      action: 'BDP_BOOK',
      payload: { lessonId: 'lesson-1' },
    });

    expect(result.txid).toBeNull();
    expect(result.anchored).toBe(false);
    expect(result.provider).toBe('noop');
    expect(logInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ledger:noop] anchorAction skipped'),
      expect.objectContaining({ tenantId: 'tenant-1', action: 'BDP_BOOK' })
    );
  });

  it('recordPayment resolves txid: null, anchored: false, and logs', async () => {
    const { NoopLedgerService } = await import('../services/Ledger/NoopLedgerService');
    const svc = new NoopLedgerService();

    const result = await svc.recordPayment({
      tenantId: 'tenant-1',
      paymentId: 'payment-1',
      amountCents: 5000,
      method: 'cash',
    });

    expect(result.txid).toBeNull();
    expect(result.anchored).toBe(false);
    expect(logInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ledger:noop] recordPayment skipped'),
      expect.objectContaining({ tenantId: 'tenant-1', paymentId: 'payment-1' })
    );
  });

  it('issueCertificate resolves txid: null, anchored: false, and logs', async () => {
    const { NoopLedgerService } = await import('../services/Ledger/NoopLedgerService');
    const svc = new NoopLedgerService();

    const result = await svc.issueCertificate({
      tenantId: 'tenant-1',
      certificateId: 'cert-1',
      studentId: 'student-1',
    });

    expect(result.txid).toBeNull();
    expect(result.anchored).toBe(false);
    expect(logInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ledger:noop] issueCertificate skipped'),
      expect.objectContaining({ tenantId: 'tenant-1', certificateId: 'cert-1' })
    );
  });

  it('getStatus resolves enabled: false, provider: noop', async () => {
    const { NoopLedgerService } = await import('../services/Ledger/NoopLedgerService');
    const svc = new NoopLedgerService();

    const status = await svc.getStatus();
    expect(status).toEqual({ enabled: false, provider: 'noop' });
  });
});

describe('ledger factory (Ledger/index.ts)', () => {
  const ORIGINAL_BSV_ENABLED = process.env.BSV_ENABLED;

  afterEach(() => {
    if (ORIGINAL_BSV_ENABLED === undefined) {
      delete process.env.BSV_ENABLED;
    } else {
      process.env.BSV_ENABLED = ORIGINAL_BSV_ENABLED;
    }
    vi.resetModules();
  });

  it('returns a noop ledger when BSV_ENABLED is unset', async () => {
    delete process.env.BSV_ENABLED;
    vi.resetModules();

    const { ledger } = await import('../services/Ledger');
    expect(ledger.enabled).toBe(false);

    const status = await ledger.getStatus();
    expect(status.provider).toBe('noop');
  });

  it('returns a noop ledger when BSV_ENABLED="false"', async () => {
    process.env.BSV_ENABLED = 'false';
    vi.resetModules();

    const { ledger } = await import('../services/Ledger');
    expect(ledger.enabled).toBe(false);

    const status = await ledger.getStatus();
    expect(status.provider).toBe('noop');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression coverage (bug found via a full codebase health audit):
// lessonService.ts used to call treasuryService.createTransaction directly,
// bypassing the ledger seam. Fixed by adding recordTreasurySplit to
// LedgerService, implemented by both NoopLedgerService and BsvLedgerService
// as a thin delegate to treasuryService.createTransaction (the one call
// site exempted to import walletService, per CLAUDE.md/LedgerService.ts's
// header rule) - createTransaction already contains its own BSV_ENABLED
// branch internally (Phase 1 Postgres write always happens; the real
// on-chain broadcast only additionally happens when enabled), so both
// implementations produce the exact same downstream call rather than
// re-deriving that branch in the seam itself.
const mockCreateTransaction = vi.fn().mockResolvedValue({ id: 'treasury-tx-1' });
vi.mock('../services/treasuryService', () => ({
  default: { createTransaction: (...args: unknown[]) => mockCreateTransaction(...args) },
}));

describe('LedgerService.recordTreasurySplit', () => {
  beforeEach(() => {
    mockCreateTransaction.mockClear();
  });

  it('NoopLedgerService.recordTreasurySplit delegates to treasuryService.createTransaction with the mapped arguments', async () => {
    const { NoopLedgerService } = await import('../services/Ledger/NoopLedgerService');
    const svc = new NoopLedgerService();

    await svc.recordTreasurySplit({
      tenantId: 'tenant-1',
      sourceType: 'lesson_booking',
      sourceId: 'lesson-1',
      grossAmount: 75,
      description: 'Treasury split from lesson booking (behind_wheel)',
      metadata: { student_id: 'student-1', instructor_id: 'instructor-1' },
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith({
      tenant_id: 'tenant-1',
      source_type: 'lesson_booking',
      source_id: 'lesson-1',
      gross_amount: 75,
      description: 'Treasury split from lesson booking (behind_wheel)',
      metadata: { student_id: 'student-1', instructor_id: 'instructor-1' },
    });
  });

  it('BsvLedgerService.recordTreasurySplit delegates to the exact same treasuryService.createTransaction call as NoopLedgerService', async () => {
    const { BsvLedgerService } = await import('../services/Ledger/BsvLedgerService');
    const svc = new BsvLedgerService();

    await svc.recordTreasurySplit({
      tenantId: 'tenant-1',
      sourceType: 'lesson_booking',
      sourceId: 'lesson-1',
      grossAmount: 75,
      description: 'Treasury split from lesson booking (behind_wheel)',
      metadata: { student_id: 'student-1', instructor_id: 'instructor-1' },
    });

    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledWith({
      tenant_id: 'tenant-1',
      source_type: 'lesson_booking',
      source_id: 'lesson-1',
      gross_amount: 75,
      description: 'Treasury split from lesson booking (behind_wheel)',
      metadata: { student_id: 'student-1', instructor_id: 'instructor-1' },
    });
  });
});

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

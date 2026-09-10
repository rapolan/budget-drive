/**
 * NoopLedgerService — active while BSV_ENABLED=false.
 *
 * Behaves exactly like the real ledger from the caller's point of view
 * (same interface, same result shape) but performs no blockchain I/O.
 * Every call is logged so you keep a local audit trail during testing
 * and can verify call sites are wired correctly before flipping the flag.
 */

import { logger } from '../../utils/logger';
import treasuryService from '../treasuryService';
import {
  LedgerService,
  LedgerAnchorParams,
  LedgerAnchorResult,
  LedgerStatus,
} from './LedgerService';

export class NoopLedgerService implements LedgerService {
  public readonly enabled = false;

  private result(): LedgerAnchorResult {
    return {
      txid: null,
      anchored: false,
      provider: 'noop',
      timestamp: new Date().toISOString(),
    };
  }

  async anchorAction(params: LedgerAnchorParams): Promise<LedgerAnchorResult> {
    logger.info('[ledger:noop] anchorAction skipped (BSV disabled)', {
      tenantId: params.tenantId,
      action: params.action,
      payloadKeys: Object.keys(params.payload),
    });
    return this.result();
  }

  async recordPayment(params: {
    tenantId: string;
    paymentId: string;
    amountCents: number;
    method: string;
  }): Promise<LedgerAnchorResult> {
    logger.info('[ledger:noop] recordPayment skipped (BSV disabled)', {
      tenantId: params.tenantId,
      paymentId: params.paymentId,
      method: params.method,
    });
    return this.result();
  }

  async issueCertificate(params: {
    tenantId: string;
    certificateId: string;
    studentId: string;
    courseCode?: string;
  }): Promise<LedgerAnchorResult> {
    logger.info('[ledger:noop] issueCertificate skipped (BSV disabled)', {
      tenantId: params.tenantId,
      certificateId: params.certificateId,
    });
    return this.result();
  }

  async recordTreasurySplit(params: {
    tenantId: string;
    sourceType: 'lesson_booking' | 'lesson_payment' | 'tip' | 'refund';
    sourceId: string;
    grossAmount: number;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    // treasuryService.createTransaction is the one call site exempted to
    // import walletService directly (see LedgerService.ts's header rule) -
    // it already contains its own BSV_ENABLED branch internally (Phase 1
    // Postgres write always happens; the real on-chain broadcast only
    // additionally happens when enabled), so this noop implementation
    // delegates straight to it rather than re-deriving that branch here.
    // A plain top-level import, not a lazy require: treasuryService (and
    // therefore @bsv/sdk via walletService) was already eagerly loaded at
    // process startup by every module that used to import it directly
    // (e.g. the old lessonService.ts) - this doesn't change that, it just
    // moves the one legitimate import to the one folder allowed to have it.
    await treasuryService.createTransaction({
      tenant_id: params.tenantId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      gross_amount: params.grossAmount,
      description: params.description,
      metadata: params.metadata,
    });
  }

  async getStatus(): Promise<LedgerStatus> {
    return { enabled: false, provider: 'noop' };
  }
}

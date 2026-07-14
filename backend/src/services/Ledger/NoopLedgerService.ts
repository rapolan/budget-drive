/**
 * NoopLedgerService — active while BSV_ENABLED=false.
 *
 * Behaves exactly like the real ledger from the caller's point of view
 * (same interface, same result shape) but performs no blockchain I/O.
 * Every call is logged so you keep a local audit trail during testing
 * and can verify call sites are wired correctly before flipping the flag.
 */

import { logger } from '../../utils/logger';
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

  async getStatus(): Promise<LedgerStatus> {
    return { enabled: false, provider: 'noop' };
  }
}

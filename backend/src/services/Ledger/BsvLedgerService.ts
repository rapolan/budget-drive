/**
 * BsvLedgerService — active when BSV_ENABLED=true.
 *
 * Thin adapter over your existing walletService (sendSats / OP_RETURN memos)
 * and treasuryService (logBDPAction, balances). Nothing here reinvents BSV
 * logic — it just funnels the LedgerService interface into the code you
 * already wrote, so re-enabling the blockchain later is a one-flag flip.
 *
 * NOTE: The two import lines below are the ONLY places in the codebase
 * (outside this folder) that should reference wallet/treasury services.
 */

import { logger } from '../../utils/logger';
import { getProtocolWallet } from '../walletService';
import treasuryService from '../treasuryService';
import {
  LedgerService,
  LedgerAnchorParams,
  LedgerAnchorResult,
  LedgerStatus,
  LedgerActionType,
} from './LedgerService';

/** Protocol fees in satoshis — mirrors protocolFees in deployment-info.json. */
const PROTOCOL_FEES: Record<LedgerActionType, number> = {
  BDP_BOOK: 5,
  BDP_PAY: 3,
  BDP_CERT: 10,
  BDP_NOTIFY: 1,
  BDP_PROGRESS: 2,
  BDP_AVAIL: 1,
  BDP_SYNC: 1,
};

export class BsvLedgerService implements LedgerService {
  public readonly enabled = true;

  async anchorAction(params: LedgerAnchorParams): Promise<LedgerAnchorResult> {
    const feeSats = params.feeSats ?? PROTOCOL_FEES[params.action];

    try {
      // Delegate to your existing treasury pipeline. Adjust the call below to
      // match treasuryService.logBDPAction's exact signature when wiring up —
      // it already handles OP_RETURN construction and DB status updates.
      const txid: string = await (treasuryService as any).logBDPAction(
        params.tenantId,
        params.action,
        params.payload,
        feeSats
      );

      return {
        txid,
        anchored: true,
        provider: 'bsv',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      // Ledger failures must NEVER break core operations. Log and degrade.
      logger.error('[ledger:bsv] anchorAction failed — continuing without anchor', {
        tenantId: params.tenantId,
        action: params.action,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        txid: null,
        anchored: false,
        provider: 'bsv',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async recordPayment(params: {
    tenantId: string;
    paymentId: string;
    amountCents: number;
    method: string;
  }): Promise<LedgerAnchorResult> {
    return this.anchorAction({
      tenantId: params.tenantId,
      action: 'BDP_PAY',
      payload: {
        paymentId: params.paymentId,
        amountCents: params.amountCents,
        method: params.method,
      },
    });
  }

  async issueCertificate(params: {
    tenantId: string;
    certificateId: string;
    studentId: string;
    courseCode?: string;
  }): Promise<LedgerAnchorResult> {
    return this.anchorAction({
      tenantId: params.tenantId,
      action: 'BDP_CERT',
      payload: {
        certificateId: params.certificateId,
        studentId: params.studentId,
        courseCode: params.courseCode ?? null,
      },
    });
  }

  async getStatus(): Promise<LedgerStatus> {
    try {
      const wallet = getProtocolWallet();
      const balanceSats = await wallet.getBalance();
      return {
        enabled: true,
        provider: 'bsv',
        network: (process.env.BSV_NETWORK as 'mainnet' | 'testnet') ?? 'testnet',
        balanceSats,
      };
    } catch (err) {
      logger.error('[ledger:bsv] getStatus failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { enabled: true, provider: 'bsv' };
    }
  }
}

/**
 * Ledger factory — picks the implementation once at startup from BSV_ENABLED.
 *
 * Usage anywhere in the backend:
 *
 *   import { ledger } from '../services/ledger';
 *   await ledger.anchorAction({ tenantId, action: 'BDP_BOOK', payload: { lessonId } });
 *
 * To enable BSV later: set BSV_ENABLED=true (plus BSV_PROTOCOL_WALLET_WIF,
 * BSV_NETWORK, TAAL_API_KEY as required) and restart. No code changes.
 */

import { logger } from '../../utils/logger';
import { LedgerService } from './LedgerService';
import { NoopLedgerService } from './NoopLedgerService';

function createLedger(): LedgerService {
  const enabled = process.env.BSV_ENABLED === 'true';

  if (!enabled) {
    logger.info('[ledger] BSV disabled — using NoopLedgerService');
    return new NoopLedgerService();
  }

  // Lazy require so @bsv/sdk and wallet code never load when the flag is off.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BsvLedgerService } = require('./BsvLedgerService');
  logger.info('[ledger] BSV enabled — using BsvLedgerService', {
    network: process.env.BSV_NETWORK ?? 'testnet',
  });
  return new BsvLedgerService();
}

export const ledger: LedgerService = createLedger();

export * from './LedgerService';

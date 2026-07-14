/**
 * LedgerService — the single seam between BDP business logic and the BSV blockchain.
 *
 * Business logic (payments, lessons, certificates, notifications) depends ONLY on
 * this interface. The concrete implementation is selected at startup from
 * BSV_ENABLED (see ./index.ts):
 *
 *   BSV_ENABLED=false → NoopLedgerService  (logs, returns txid: null)
 *   BSV_ENABLED=true  → BsvLedgerService   (wraps walletService / treasuryService)
 *
 * Rules:
 *  - Never import walletService or treasuryService directly outside this folder.
 *  - All results carry `anchored: boolean` so callers can behave sensibly either way.
 *  - txid is `string | null` — every consumer must tolerate null.
 */

/** BDP protocol action types (mirrors protocolFees in deployment-info.json). */
export type LedgerActionType =
  | 'BDP_BOOK'     // lesson booked            (5 sats)
  | 'BDP_PAY'      // payment recorded         (3 sats)
  | 'BDP_CERT'     // certificate issued       (10 sats)
  | 'BDP_NOTIFY'   // notification sent        (1 sat)
  | 'BDP_PROGRESS' // student progress update  (2 sats)
  | 'BDP_AVAIL'    // availability change      (1 sat)
  | 'BDP_SYNC';    // external calendar sync   (1 sat)

export interface LedgerAnchorParams {
  /** Tenant the action belongs to. Required — everything in BDP is tenant-scoped. */
  tenantId: string;
  /** Which protocol action is being anchored. */
  action: LedgerActionType;
  /**
   * Compact JSON-serializable payload describing the action.
   * Keep it small — this becomes OP_RETURN data when BSV is enabled.
   * Never include PII (names, emails, phone numbers). Use internal IDs.
   */
  payload: Record<string, unknown>;
  /** Optional fee override in satoshis. Defaults to the protocol fee for the action. */
  feeSats?: number;
}

export interface LedgerAnchorResult {
  /** Blockchain transaction id, or null when the ledger is disabled. */
  txid: string | null;
  /** True only if the action was actually written on-chain. */
  anchored: boolean;
  /** Which implementation handled the call. */
  provider: 'bsv' | 'noop';
  /** ISO timestamp of when the ledger handled the action. */
  timestamp: string;
}

export interface LedgerStatus {
  enabled: boolean;
  provider: 'bsv' | 'noop';
  network?: 'mainnet' | 'testnet';
  /** Protocol wallet balance in satoshis (only when enabled). */
  balanceSats?: number;
}

export interface LedgerService {
  /** Whether on-chain anchoring is active. */
  readonly enabled: boolean;

  /**
   * Anchor a BDP protocol action. This is the generic entry point —
   * booking, availability, notifications, progress, and sync all use it.
   */
  anchorAction(params: LedgerAnchorParams): Promise<LedgerAnchorResult>;

  /**
   * Record a fiat/off-chain payment's audit anchor (BDP_PAY).
   * The payment itself lives in PostgreSQL; this only anchors the audit trail.
   */
  recordPayment(params: {
    tenantId: string;
    paymentId: string;
    amountCents: number;
    method: string;
  }): Promise<LedgerAnchorResult>;

  /**
   * Anchor a certificate issuance (BDP_CERT).
   */
  issueCertificate(params: {
    tenantId: string;
    certificateId: string;
    studentId: string;
    courseCode?: string;
  }): Promise<LedgerAnchorResult>;

  /** Health/diagnostics for the /treasury/status style endpoints. */
  getStatus(): Promise<LedgerStatus>;
}

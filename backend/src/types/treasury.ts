/**
 * Treasury Types - Budget Drive Protocol (BDP)
 * Patent Documentation: See PATENT_DOCUMENTATION.md - Claim #2
 */

export interface TreasuryTransaction {
  id: string;
  tenant_id: string;
  source_type: 'lesson_booking' | 'lesson_payment' | 'tip' | 'refund';
  source_id: string;
  gross_amount: number;
  treasury_split: number;
  provider_amount: number;
  bsv_txid?: string;
  bsv_action?: 'BDP_BOOK' | 'BDP_PAY' | 'BDP_TIP' | 'BDP_REFUND';
  bsv_satoshis?: number;
  bsv_fee_satoshis?: number;
  bsv_status: 'pending' | 'confirmed' | 'failed';
  description?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  confirmed_at?: Date;
}

export interface TreasuryBalance {
  id: string;
  tenant_id: string;
  total_collected: number;
  total_spent: number;
  current_balance: number;
  bsv_wallet_address?: string;
  bsv_wallet_balance_satoshis?: number;
  transaction_count: number;
  last_transaction_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TreasurySpending {
  id: string;
  tenant_id: string;
  spend_type: 'reward' | 'fee' | 'bounty' | 'refund';
  amount: number;
  recipient_type?: string;
  recipient_id?: string;
  bsv_txid?: string;
  bsv_satoshis?: number;
  bsv_status: 'pending' | 'confirmed' | 'failed';
  description?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  confirmed_at?: Date;
}

export interface BDPAction {
  id: string;
  tenant_id: string;
  action_type: 'BDP_REG' | 'BDP_BOOK' | 'BDP_PROGRESS' | 'BDP_CERT' | 'BDP_AVAIL' | 'BDP_SYNC' | 'BDP_TIP';
  action_data: string;
  bsv_txid?: string;
  bsv_fee_satoshis?: number;
  bsv_status: 'pending' | 'confirmed' | 'failed';
  user_id?: string;
  entity_id?: string;
  entity_type?: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  confirmed_at?: Date;
}

export interface TreasurySplitResult {
  treasury: number;
  provider: number;
}

export interface CreateTreasuryTransactionDTO {
  tenant_id: string;
  source_type: 'lesson_booking' | 'lesson_payment' | 'tip' | 'refund';
  source_id: string;
  gross_amount: number;
  description?: string;
  metadata?: Record<string, any>;
  user_id?: string;
}

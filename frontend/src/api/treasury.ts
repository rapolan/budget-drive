/**
 * Treasury API Client
 * BDP Phase 1: Treasury dashboard with satoshi-level fee tracking
 */

import { apiClient } from './client';

export interface TreasuryBalance {
  id: string;
  tenant_id: string;
  total_collected: number;
  total_spent: number;
  current_balance: number;
  bsv_wallet_address: string | null;
  bsv_wallet_balance_satoshis: number;
  transaction_count: number;
  last_transaction_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreasuryTransaction {
  id: string;
  tenant_id: string;
  source_type: string;
  source_id: string;
  gross_amount: number;
  treasury_split: number;
  provider_amount: number;
  bsv_txid: string | null;
  bsv_action: string;
  bsv_satoshis: number;
  bsv_fee_satoshis: number;
  bsv_status: 'pending' | 'confirmed' | 'failed';
  description: string;
  metadata: any;
  created_at: string;
  confirmed_at: string | null;
}

export interface TreasuryStatistics {
  balance: TreasuryBalance | null;
  statistics: {
    total_transactions: number;
    total_gross: number;
    total_treasury: number;
    total_provider: number;
    first_transaction: string | null;
    last_transaction: string | null;
  };
}

/**
 * Get treasury balance for current tenant
 */
export const getBalance = async (): Promise<TreasuryBalance | null> => {
  const response = await apiClient.get('/treasury/balance');
  return response.data;
};

/**
 * Get recent treasury transactions
 */
export const getRecentTransactions = async (limit = 50): Promise<TreasuryTransaction[]> => {
  const response = await apiClient.get('/treasury/transactions', {
    params: { limit },
  });
  return response.data;
};

/**
 * Get treasury statistics (balance + aggregates)
 */
export const getStatistics = async (): Promise<TreasuryStatistics> => {
  const response = await apiClient.get('/treasury/statistics');
  return response.data;
};

/**
 * Format satoshis to BSV with proper decimals
 */
export const formatSatoshisToBSV = (satoshis: number): string => {
  const bsv = satoshis / 100000000;
  return bsv.toFixed(8);
};

/**
 * Calculate USD value of satoshis at given BSV price
 */
export const satoshisToUSD = (satoshis: number, bsvPrice: number = 47): number => {
  const bsv = satoshis / 100000000;
  return bsv * bsvPrice;
};

/**
 * Format currency with proper decimals
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8, // Show satoshi-level precision
  }).format(amount);
};

/**
 * Treasury Service - Budget Drive Protocol (BDP)
 * Patent Documentation: See PATENT_DOCUMENTATION.md - Claim #2 (Self-Funding Treasury)
 *
 * This service implements the 1% micropayment split mechanism that funds protocol operations
 * Dual-write architecture: PostgreSQL (current) + BSV blockchain (future)
 */

import pool from '../config/database';
import {
  TreasuryTransaction,
  TreasuryBalance,
  CreateTreasuryTransactionDTO,
  TreasurySplitResult,
  BDPAction,
} from '../types/treasury';

class TreasuryService {
  /**
   * Calculate 1% treasury split (Patent Claim #2)
   * @param grossAmount - Original transaction amount ($50.00)
   * @returns {treasury: $0.50, provider: $49.50}
   */
  calculateSplit(grossAmount: number): TreasurySplitResult {
    const treasury = Math.round(grossAmount * 0.01 * 100) / 100; // 1% rounded to 2 decimals
    const provider = Math.round(grossAmount * 0.99 * 100) / 100; // 99% rounded to 2 decimals
    return { treasury, provider };
  }

  /**
   * Create treasury transaction (Dual-write: PG + BSV)
   * Phase 1: PostgreSQL only (BSV disabled for pilot)
   * Phase 3: Enable BSV blockchain writes
   */
  async createTransaction(data: CreateTreasuryTransactionDTO): Promise<TreasuryTransaction> {
    const { treasury, provider } = this.calculateSplit(data.gross_amount);

    // Insert into PostgreSQL
    const query = `
      INSERT INTO treasury_transactions (
        tenant_id, source_type, source_id, gross_amount, treasury_split, provider_amount,
        bsv_status, description, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      data.tenant_id,
      data.source_type,
      data.source_id,
      data.gross_amount,
      treasury,
      provider,
      'pending', // BSV status (will be 'confirmed' when blockchain enabled)
      data.description || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ];

    const result = await pool.query(query, values);
    const transaction = result.rows[0];

    // Phase 1: Skip BSV blockchain write (pilot testing)
    // Phase 3: Uncomment below to enable BSV
    /*
    try {
      const bsvTxid = await this.writeToBSVBlockchain(transaction);
      await this.updateBSVStatus(transaction.id, bsvTxid, 'confirmed');
    } catch (error) {
      console.error('BSV write failed:', error);
      await this.updateBSVStatus(transaction.id, null, 'failed');
    }
    */

    return this.mapToTreasuryTransaction(transaction);
  }

  /**
   * Get treasury balance for tenant
   */
  async getBalance(tenantId: string): Promise<TreasuryBalance | null> {
    const query = 'SELECT * FROM treasury_balances WHERE tenant_id = $1';
    const result = await pool.query(query, [tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToTreasuryBalance(result.rows[0]);
  }

  /**
   * Get recent treasury transactions
   */
  async getRecentTransactions(tenantId: string, limit = 50): Promise<TreasuryTransaction[]> {
    const query = `
      SELECT * FROM treasury_transactions
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await pool.query(query, [tenantId, limit]);
    return result.rows.map(this.mapToTreasuryTransaction);
  }

  /**
   * Get treasury statistics for tenant
   */
  async getStatistics(tenantId: string) {
    const balanceQuery = 'SELECT * FROM treasury_balances WHERE tenant_id = $1';
    const balanceResult = await pool.query(balanceQuery, [tenantId]);

    const statsQuery = `
      SELECT
        COUNT(*) as total_transactions,
        SUM(gross_amount) as total_gross,
        SUM(treasury_split) as total_treasury,
        SUM(provider_amount) as total_provider,
        MIN(created_at) as first_transaction,
        MAX(created_at) as last_transaction
      FROM treasury_transactions
      WHERE tenant_id = $1
    `;
    const statsResult = await pool.query(statsQuery, [tenantId]);

    return {
      balance: balanceResult.rows[0] || null,
      statistics: statsResult.rows[0],
    };
  }

  /**
   * Log BDP action (for comprehensive blockchain activity tracking)
   */
  async logBDPAction(
    tenantId: string,
    actionType: BDPAction['action_type'],
    actionData: string,
    options: {
      userId?: string;
      entityId?: string;
      entityType?: string;
      description?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<BDPAction> {
    const query = `
      INSERT INTO bdp_actions_log (
        tenant_id, action_type, action_data, user_id, entity_id, entity_type,
        bsv_status, description, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      tenantId,
      actionType,
      actionData,
      options.userId || null,
      options.entityId || null,
      options.entityType || null,
      'pending', // Will be 'confirmed' when BSV enabled
      options.description || null,
      options.metadata ? JSON.stringify(options.metadata) : null,
    ];

    const result = await pool.query(query, values);
    return this.mapToBDPAction(result.rows[0]);
  }

  // PHASE 3: BSV blockchain methods (commented out for Phase 1)
  /*
  private async writeToBSVBlockchain(transaction: any): Promise<string> {
    // TODO Phase 3: Implement BSV transaction
    // const bsv = require('bsv');
    // const privateKey = process.env.BSV_PRIVATE_KEY;
    //
    // const tx = new bsv.Transaction()
    //   .from(utxo)
    //   .to(process.env.TREASURY_BSV_ADDRESS, satoshis)
    //   .addData(`BDP_PAY|${transaction.id}|${transaction.treasury_split}`)
    //   .change(changeAddress)
    //   .sign(privateKey);
    //
    // return tx.id;

    throw new Error('BSV blockchain write not implemented yet (Phase 3)');
  }

  private async updateBSVStatus(
    transactionId: string,
    bsvTxid: string | null,
    status: 'pending' | 'confirmed' | 'failed'
  ): Promise<void> {
    const query = `
      UPDATE treasury_transactions
      SET bsv_txid = $1, bsv_status = $2, confirmed_at = $3
      WHERE id = $4
    `;
    const confirmedAt = status === 'confirmed' ? new Date() : null;
    await pool.query(query, [bsvTxid, status, confirmedAt, transactionId]);
  }
  */

  // Mapping helpers
  private mapToTreasuryTransaction(row: any): TreasuryTransaction {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      source_type: row.source_type,
      source_id: row.source_id,
      gross_amount: parseFloat(row.gross_amount),
      treasury_split: parseFloat(row.treasury_split),
      provider_amount: parseFloat(row.provider_amount),
      bsv_txid: row.bsv_txid,
      bsv_action: row.bsv_action,
      bsv_satoshis: row.bsv_satoshis,
      bsv_fee_satoshis: row.bsv_fee_satoshis || 5,
      bsv_status: row.bsv_status,
      description: row.description,
      metadata: row.metadata,
      created_at: row.created_at,
      confirmed_at: row.confirmed_at,
    };
  }

  private mapToTreasuryBalance(row: any): TreasuryBalance {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      total_collected: parseFloat(row.total_collected),
      total_spent: parseFloat(row.total_spent),
      current_balance: parseFloat(row.current_balance),
      bsv_wallet_address: row.bsv_wallet_address,
      bsv_wallet_balance_satoshis: row.bsv_wallet_balance_satoshis,
      transaction_count: row.transaction_count,
      last_transaction_at: row.last_transaction_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapToBDPAction(row: any): BDPAction {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      action_type: row.action_type,
      action_data: row.action_data,
      bsv_txid: row.bsv_txid,
      bsv_fee_satoshis: row.bsv_fee_satoshis || 5,
      bsv_status: row.bsv_status,
      user_id: row.user_id,
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      description: row.description,
      metadata: row.metadata,
      created_at: row.created_at,
      confirmed_at: row.confirmed_at,
    };
  }
}

export default new TreasuryService();

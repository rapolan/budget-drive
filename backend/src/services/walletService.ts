/**
 * BSV Wallet Service
 *
 * Manages BSV blockchain wallet operations for the Budget Drive Protocol.
 * Handles private key management, transaction creation, signing, and broadcasting.
 *
 * Design Philosophy (Craig Wright Aligned):
 * - Simple P2PKH transactions (no unnecessary complexity)
 * - Testnet for development, mainnet for production
 * - Direct node communication (no middleman APIs when possible)
 * - Transparent fee calculation
 */

import { PrivateKey, Transaction, P2PKH, ARC } from '@bsv/sdk';
import { config } from '../config/env';

interface WalletConfig {
  privateKey?: string; // WIF format (Wallet Import Format)
  network: 'mainnet' | 'testnet';
}

interface SendSatsParams {
  toAddress: string;
  amountSats: number;
  memo?: string; // Optional OP_RETURN data
}

interface TransactionResult {
  txid: string;
  rawTx: string;
  fee: number;
  success: boolean;
  error?: string;
}

class WalletService {
  private privateKey: PrivateKey;
  private network: 'mainnet' | 'testnet';
  private arcEndpoint: string;

  constructor(walletConfig: WalletConfig) {
    this.network = walletConfig.network;

    // Initialize private key (generate new one if not provided)
    if (walletConfig.privateKey) {
      this.privateKey = PrivateKey.fromWif(walletConfig.privateKey);
    } else {
      // Generate new private key for testnet development
      this.privateKey = PrivateKey.fromRandom();
      console.log('🔑 New wallet generated');
      console.log('⚠️  SAVE THIS PRIVATE KEY (WIF):', this.privateKey.toWif());
      console.log('📍 Address:', this.getAddress());
    }

    // Set ARC endpoint based on network
    this.arcEndpoint = this.network === 'testnet'
      ? 'https://arc-testnet.taal.com'
      : 'https://arc.taal.com';
  }

  /**
   * Get the wallet's BSV address (P2PKH format)
   */
  getAddress(): string {
    const pubKey = this.privateKey.toPublicKey();
    return pubKey.toAddress();
  }

  /**
   * Get the private key in WIF format (for backup/storage)
   */
  getPrivateKeyWif(): string {
    return this.privateKey.toWif();
  }

  /**
   * Send satoshis to an address
   *
   * This implements the core micropayment functionality for BDP.
   * Each treasury action (booking, payment, notification) triggers this.
   *
   * @param params - Transaction parameters
   * @returns Transaction result with txid
   */
  async sendSats(params: SendSatsParams): Promise<TransactionResult> {
    try {
      const { toAddress, amountSats, memo } = params;

      // Create transaction
      const tx = new Transaction();

      // TODO: Add UTXOs as inputs
      // For now, this is a placeholder - we need to implement UTXO management
      // In production, we'll query the blockchain for unspent outputs

      // Add output (payment to recipient)
      const lockingScript = new P2PKH().lock(toAddress);
      tx.addOutput({
        lockingScript,
        satoshis: amountSats,
      });

      // Add OP_RETURN output if memo provided (for Merkle roots later)
      if (memo) {
        const opReturnScript = new P2PKH().lock('OP_FALSE OP_RETURN ' + Buffer.from(memo).toString('hex'));
        tx.addOutput({
          lockingScript: opReturnScript,
          satoshis: 0,
        });
      }

      // Sign transaction
      await tx.sign();

      // Broadcast via ARC
      const arc = new ARC(this.arcEndpoint, {
        apiKey: config.TAAL_API_KEY || '',
      });

      const result = await arc.broadcast(tx);

      return {
        txid: result.txid || tx.id('hex') || '',
        rawTx: tx.toHex(),
        fee: tx.getFee(),
        success: true,
      };

    } catch (error: any) {
      console.error('❌ Transaction failed:', error);
      return {
        txid: '',
        rawTx: '',
        fee: 0,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get wallet balance (requires blockchain query)
   *
   * NOTE: This requires integration with a blockchain API or node.
   * For MVP, we'll track balance internally in PostgreSQL.
   */
  async getBalance(): Promise<number> {
    // TODO: Implement blockchain balance query
    // Options:
    // 1. WhatsOnChain API (simple but centralized)
    // 2. Direct node RPC (decentralized but complex)
    // 3. Track UTXOs in PostgreSQL (fast but requires sync)

    console.warn('⚠️  Balance checking not yet implemented');
    return 0;
  }

  /**
   * Fund the wallet with testnet coins
   *
   * For development: Get free testnet BSV from faucet
   * URL: https://faucet.bsvblockchain.org/
   */
  getFaucetInstructions(): { address: string; faucetUrl: string } {
    return {
      address: this.getAddress(),
      faucetUrl: 'https://faucet.bsvblockchain.org/',
    };
  }

  /**
   * Batch multiple micropayments into single transaction
   *
   * This is the Merkle aggregation optimization described by Grok.
   * Instead of 100 separate transactions, we send 1 transaction with:
   * - 1 output to protocol wallet (sum of all fees)
   * - 1 OP_RETURN with Merkle root
   *
   * Cost: ~40-60 sats miner fee vs 1,500-3,000 sats collected = 98% margin
   */
  async batchMicropayments(
    toAddress: string,
    totalSats: number,
    merkleRoot: string
  ): Promise<TransactionResult> {
    return this.sendSats({
      toAddress,
      amountSats: totalSats,
      memo: `MERKLE:${merkleRoot}`, // Store Merkle root on-chain
    });
  }
}

// Singleton instance for the protocol wallet
let protocolWallet: WalletService | null = null;

/**
 * Get the BDP protocol wallet instance
 *
 * This is the wallet that receives all micropayment fees.
 * Private key should be stored securely in environment variables.
 */
export function getProtocolWallet(): WalletService {
  if (!protocolWallet) {
    protocolWallet = new WalletService({
      privateKey: config.BSV_PROTOCOL_WALLET_WIF, // Load from .env
      network: config.BSV_NETWORK as 'mainnet' | 'testnet' || 'testnet',
    });
  }
  return protocolWallet;
}

/**
 * Create a new wallet (for testing or generating tenant wallets)
 */
export function createWallet(network: 'mainnet' | 'testnet' = 'testnet'): WalletService {
  return new WalletService({ network });
}

export default WalletService;

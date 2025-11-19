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

import { PrivateKey, Transaction, P2PKH, ARC, Script, SatoshisPerKilobyte } from '@bsv/sdk';
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
   * Testnet addresses start with 'm' or 'n'
   * Mainnet addresses start with '1'
   */
  getAddress(): string {
    const pubKey = this.privateKey.toPublicKey();
    // For testnet, use testnet network prefix (111 instead of 0)
    if (this.network === 'testnet') {
      return pubKey.toAddress('testnet');
    }
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

      // Step 1: Fetch UTXOs from WhatsOnChain
      const address = this.getAddress();
      const wocEndpoint = this.network === 'testnet'
        ? `https://api.whatsonchain.com/v1/bsv/test`
        : `https://api.whatsonchain.com/v1/bsv/main`;

      const utxosResponse = await fetch(`${wocEndpoint}/address/${address}/unspent`);
      if (!utxosResponse.ok) {
        throw new Error(`Failed to fetch UTXOs: ${utxosResponse.statusText}`);
      }

      const utxos: any[] = await utxosResponse.json() as any[];

      if (!utxos || utxos.length === 0) {
        throw new Error('No UTXOs available. Wallet may not be funded yet.');
      }

      // Step 2: Create transaction
      const tx = new Transaction();

      // Step 3: Add inputs from UTXOs
      let totalInput = 0;
      for (const utxo of utxos) {
        // Fetch the previous transaction hex
        const prevTxResponse = await fetch(`${wocEndpoint}/tx/${utxo.tx_hash}/hex`);
        if (!prevTxResponse.ok) {
          throw new Error(`Failed to fetch transaction ${utxo.tx_hash}: ${prevTxResponse.statusText}`);
        }
        const prevTxHex = await prevTxResponse.text();

        // Parse the source transaction
        const sourceTransaction = Transaction.fromHex(prevTxHex);

        // Verify the UTXO output exists and has the expected value
        const sourceOutput = sourceTransaction.outputs[utxo.tx_pos];
        if (!sourceOutput) {
          throw new Error(`Output ${utxo.tx_pos} not found in transaction ${utxo.tx_hash}`);
        }

        // Add input with properly structured parameters
        tx.addInput({
          sourceTransaction,
          sourceOutputIndex: utxo.tx_pos,
          unlockingScriptTemplate: new P2PKH().unlock(this.privateKey),
          sequence: 0xFFFFFFFF
        });

        totalInput += utxo.value;

        // Break when we have enough to cover amount + estimated fees
        if (totalInput >= amountSats + 1000) {
          break;
        }
      }

      // Verify we have sufficient funds
      if (totalInput < amountSats) {
        throw new Error(`Insufficient funds. Have ${totalInput} satoshis, need ${amountSats}`);
      }

      // Step 4: Add payment output
      const lockingScript = new P2PKH().lock(toAddress);
      tx.addOutput({
        lockingScript,
        satoshis: amountSats,
      });

      // Step 5: Add OP_RETURN output if memo provided
      if (memo) {
        const dataBuffer = Buffer.from(memo, 'utf8');
        const opReturnScript = Script.fromASM(`OP_FALSE OP_RETURN ${dataBuffer.toString('hex')}`);
        tx.addOutput({
          lockingScript: opReturnScript,
          satoshis: 0,
        });
      }

      // Step 6: Add change output (let SDK calculate proper fee)
      // Mark this output for change calculation
      const changeLockingScript = new P2PKH().lock(address);
      tx.addOutput({
        lockingScript: changeLockingScript,
        change: true,
      });

      // Step 7: Calculate and apply proper fee
      // Use standard BSV fee rate: 50 satoshis per kilobyte
      await tx.fee(new SatoshisPerKilobyte(50));

      // Verify change output wasn't reduced to dust
      const changeOutput = tx.outputs[tx.outputs.length - 1];
      if (changeOutput.satoshis && changeOutput.satoshis < 1) {
        // Remove dust change output
        tx.outputs.pop();
      }

      // Step 8: Sign transaction
      await tx.sign();

      // Step 9: Broadcast via ARC
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

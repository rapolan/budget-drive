# Blockchain Integration Roadmap - BSV + BRC-100

**Status:** Planned for Phase 6
**Target:** Q1 2026
**Stack:** Bitcoin SV (BSV) via Teranode + BRC-100 Token Standard + GorillaPool/Babbage SDK

---

## Executive Summary

This document outlines the complete implementation plan for integrating Bitcoin SV blockchain payments and BRC-100 tokens into the Budget Driving School platform. This will enable:

- **BSV Cryptocurrency Payments** - Accept Bitcoin SV for lesson payments
- **MNEE Stablecoin** - Zero-fee, USD-pegged payments
- **BRC-100 Tokens** - Issue lesson credits/vouchers as blockchain tokens
- **Wallet Integration** - BRC-100 compliant user wallets
- **On-Chain Indexing** - Real-time transaction monitoring via JungleBus

---

## Current Status (Phase 4A Complete)

### What We Have
- ✅ Database schema ready (`payments` table with payment_method flexibility)
- ✅ Multi-tenant architecture (isolated blockchain wallets per tenant)
- ✅ Payment tracking infrastructure
- ✅ Environment configuration structure

### What We Need (Per Grok's Analysis)
- ❌ BSV SDK integration (@bsv/sdk, @babbage/sdk)
- ❌ BRC-100 wallet compliance
- ❌ JungleBus indexer (GorillaPool)
- ❌ Teranode RPC integration
- ❌ Frontend wallet hooks
- ❌ Docker infrastructure for indexing

**We are 80% architecturally ready - just need to implement the blockchain layer.**

---

## Technical Architecture

### High-Level Flow

```
Student Selects BSV Payment
    ↓
Frontend: Request wallet approval (BRC-100)
    ↓
Backend: Generate payment address/request
    ↓
Student: Sends BSV/MNEE from wallet
    ↓
JungleBus: Monitors blockchain for transaction
    ↓
Teranode: Confirms transaction
    ↓
Backend: Updates payment status to 'completed'
    ↓
Database: Records transaction details
```

### Component Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Blockchain** | Bitcoin SV (BSV) | Layer 1 blockchain |
| **Node** | Teranode | High-performance BSV node |
| **Indexer** | JungleBus (GorillaPool) | Real-time transaction monitoring |
| **Token Standard** | BRC-100 | Fungible token protocol |
| **Stablecoin** | MNEE | 1:1 USD pegged token |
| **SDK (Backend)** | @bsv/sdk, @babbage/sdk | Core BSV functionality |
| **SDK (Frontend)** | @bsv/sdk | Wallet interactions |
| **Schema** | bitcoin-schema | Structured on-chain data |

---

## Phase 6: Implementation Plan

### Step 1: Dependencies Installation

**Backend Dependencies:**
```bash
cd backend
npm install @bsv/sdk @babbage/sdk bitcoin-schema axios express-rate-limit
```

**Frontend Dependencies:**
```bash
cd frontend
npm install @bsv/sdk
```

**Global Dependencies:**
```bash
npm install -g pnpm  # If not already installed
```

### Step 2: Infrastructure Setup

**Docker Compose Configuration:**

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  # PostgreSQL (existing)
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: budget_driving_school
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # JungleBus - BSV Transaction Indexer
  junglebus:
    image: gorillapool/junglebus:latest
    environment:
      - NETWORK=testnet
      - RPC_HOST=${TERANODE_RPC_URL}
      - RPC_USER=${TERANODE_API_KEY}
    ports:
      - "8080:8080"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

**Start Command:**
```bash
docker-compose up -d
```

### Step 3: Environment Configuration

**Update `backend/.env.example`:**

```env
# =====================================================
# BSV BLOCKCHAIN CONFIGURATION
# =====================================================
BSV_NETWORK=testnet
TERANODE_RPC_URL=https://teranode-rpc.gorillapool.io
TERANODE_API_KEY=your_api_key_here

# JungleBus Indexer
JUNGLEBUS_URL=http://localhost:8080

# Wallet Configuration
BSV_HD_SEED=your_hd_wallet_seed_here  # Generate securely
BSV_DERIVATION_PATH=m/44'/0'/0'

# MNEE Stablecoin
MNEE_TOKEN_ID=your_mnee_token_id
MNEE_DECIMALS=8

# Rate Limiting (for payment endpoints)
BLOCKCHAIN_RATE_LIMIT_WINDOW=15
BLOCKCHAIN_RATE_LIMIT_MAX=10
```

### Step 4: Database Schema Extensions

**Create Migration: `003_blockchain_tables.sql`**

```sql
-- =====================================================
-- BLOCKCHAIN TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

    -- Transaction Details
    txid VARCHAR(64) NOT NULL UNIQUE,
    network VARCHAR(20) NOT NULL CHECK (network IN ('mainnet', 'testnet')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),

    -- Amounts
    amount_satoshis BIGINT NOT NULL,
    token_id VARCHAR(64),  -- NULL for raw BSV, populated for MNEE/tokens
    token_symbol VARCHAR(10),  -- 'BSV', 'MNEE', etc.

    -- Addresses
    sender_address VARCHAR(64),
    recipient_address VARCHAR(64) NOT NULL,

    -- Confirmation Details
    block_height INTEGER,
    confirmations INTEGER DEFAULT 0,
    confirmed_at TIMESTAMP,

    -- Metadata
    raw_tx TEXT,  -- Full transaction hex
    op_return_data TEXT,  -- Structured data (lesson ID, etc.)

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_blockchain_tx_txid ON blockchain_transactions(txid);
CREATE INDEX idx_blockchain_tx_tenant ON blockchain_transactions(tenant_id);
CREATE INDEX idx_blockchain_tx_payment ON blockchain_transactions(payment_id);
CREATE INDEX idx_blockchain_tx_status ON blockchain_transactions(status);

-- =====================================================
-- TENANT WALLETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

    -- HD Wallet Derivation
    derivation_index INTEGER NOT NULL DEFAULT 0,
    public_key VARCHAR(130) NOT NULL,
    address VARCHAR(64) NOT NULL UNIQUE,

    -- Balance Tracking
    balance_satoshis BIGINT DEFAULT 0,
    last_sync_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tenant_wallets_tenant ON tenant_wallets(tenant_id);
CREATE INDEX idx_tenant_wallets_address ON tenant_wallets(address);

-- =====================================================
-- BRC-100 TOKEN BALANCES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS token_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES tenant_wallets(id) ON DELETE CASCADE,

    -- Token Details
    token_id VARCHAR(64) NOT NULL,
    token_symbol VARCHAR(10) NOT NULL,
    balance BIGINT DEFAULT 0,  -- In smallest unit (satoshis for MNEE)

    last_updated TIMESTAMP DEFAULT NOW(),

    UNIQUE(wallet_id, token_id)
);

CREATE INDEX idx_token_balances_wallet ON token_balances(wallet_id);
CREATE INDEX idx_token_balances_token ON token_balances(token_id);

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS update_blockchain_transactions_updated_at ON blockchain_transactions;
CREATE TRIGGER update_blockchain_transactions_updated_at
    BEFORE UPDATE ON blockchain_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_wallets_updated_at ON tenant_wallets;
CREATE TRIGGER update_tenant_wallets_updated_at
    BEFORE UPDATE ON tenant_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### Step 5: Backend Services Implementation

**File 1: `backend/src/services/brc100WalletService.ts`**

```typescript
/**
 * BRC-100 Wallet Service
 * Handles BRC-100 compliant wallet interactions
 */

import { PrivateKey, PublicKey, Transaction } from '@bsv/sdk';
import { config } from '../config/env';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface PaymentRequest {
  tenantId: string;
  recipientAddress: string;
  amountSatoshis: number;
  tokenId?: string;  // For MNEE or other BRC-100 tokens
  metadata?: Record<string, any>;  // Lesson ID, student ID, etc.
}

export class BRC100WalletService {
  private hdSeed: string;

  constructor() {
    this.hdSeed = config.BSV_HD_SEED || '';
    if (!this.hdSeed) {
      throw new AppError('BSV_HD_SEED not configured', 500);
    }
  }

  /**
   * Generate tenant-specific wallet address
   */
  async getTenantWallet(tenantId: string): Promise<{ address: string; publicKey: string }> {
    // Check if tenant already has a wallet
    const existing = await query(
      'SELECT address, public_key FROM tenant_wallets WHERE tenant_id = $1',
      [tenantId]
    );

    if (existing.rows.length > 0) {
      return {
        address: existing.rows[0].address,
        publicKey: existing.rows[0].public_key,
      };
    }

    // Generate new wallet from HD seed
    const derivationIndex = await this.getNextDerivationIndex();
    const privateKey = PrivateKey.fromWif(this.hdSeed);
    const publicKey = PublicKey.fromPrivateKey(privateKey);
    const address = publicKey.toAddress().toString();

    // Store in database
    await query(
      `INSERT INTO tenant_wallets (tenant_id, derivation_index, public_key, address)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, derivationIndex, publicKey.toString(), address]
    );

    return { address, publicKey: publicKey.toString() };
  }

  /**
   * Create BRC-100 payment request
   */
  async createPaymentRequest(request: PaymentRequest): Promise<{
    address: string;
    amount: number;
    tokenId?: string;
    qrData: string;
  }> {
    const wallet = await this.getTenantWallet(request.tenantId);

    // Generate payment URI (BRC-21 standard)
    const uri = this.generatePaymentURI(
      wallet.address,
      request.amountSatoshis,
      request.tokenId,
      request.metadata
    );

    return {
      address: wallet.address,
      amount: request.amountSatoshis,
      tokenId: request.tokenId,
      qrData: uri,
    };
  }

  /**
   * Generate BRC-21 payment URI
   */
  private generatePaymentURI(
    address: string,
    amount: number,
    tokenId?: string,
    metadata?: Record<string, any>
  ): string {
    let uri = `bitcoin:${address}?amount=${amount}`;

    if (tokenId) {
      uri += `&token=${tokenId}`;
    }

    if (metadata) {
      uri += `&message=${encodeURIComponent(JSON.stringify(metadata))}`;
    }

    return uri;
  }

  /**
   * Get next derivation index for HD wallet
   */
  private async getNextDerivationIndex(): Promise<number> {
    const result = await query(
      'SELECT COALESCE(MAX(derivation_index), -1) + 1 AS next_index FROM tenant_wallets'
    );
    return result.rows[0].next_index;
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(tenantId: string): Promise<{
    bsv: number;
    tokens: Array<{ symbol: string; balance: number }>;
  }> {
    const wallet = await query(
      'SELECT balance_satoshis FROM tenant_wallets WHERE tenant_id = $1',
      [tenantId]
    );

    if (wallet.rows.length === 0) {
      throw new AppError('Wallet not found', 404);
    }

    const tokens = await query(
      `SELECT token_symbol, balance FROM token_balances tb
       JOIN tenant_wallets tw ON tb.wallet_id = tw.id
       WHERE tw.tenant_id = $1`,
      [tenantId]
    );

    return {
      bsv: wallet.rows[0].balance_satoshis,
      tokens: tokens.rows.map(t => ({
        symbol: t.token_symbol,
        balance: t.balance,
      })),
    };
  }
}
```

**File 2: `backend/src/services/junglebusService.ts`**

```typescript
/**
 * JungleBus Service
 * Monitors and indexes BSV transactions
 */

import axios from 'axios';
import { config } from '../config/env';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface Transaction {
  txid: string;
  blockHeight?: number;
  confirmations: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export class JungleBusService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.JUNGLEBUS_URL || 'http://localhost:8080';
  }

  /**
   * Monitor address for incoming transactions
   */
  async monitorAddress(address: string, tenantId: string): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/api/v1/subscribe`, {
        address,
        callback: `${config.API_BASE_URL}/api/v1/blockchain/webhook/${tenantId}`,
      });
    } catch (error) {
      throw new AppError('Failed to subscribe to address monitoring', 500);
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txid: string): Promise<Transaction> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/tx/${txid}`);

      return {
        txid: response.data.txid,
        blockHeight: response.data.blockHeight,
        confirmations: response.data.confirmations || 0,
        status: response.data.confirmations >= 6 ? 'confirmed' : 'pending',
      };
    } catch (error) {
      throw new AppError('Failed to fetch transaction', 500);
    }
  }

  /**
   * Handle transaction webhook callback
   */
  async handleTransactionWebhook(txid: string, tenantId: string): Promise<void> {
    const tx = await this.getTransaction(txid);

    // Update database
    await query(
      `UPDATE blockchain_transactions
       SET status = $1, confirmations = $2, block_height = $3, confirmed_at = NOW()
       WHERE txid = $4 AND tenant_id = $5`,
      [tx.status, tx.confirmations, tx.blockHeight, txid, tenantId]
    );

    // If confirmed, update payment status
    if (tx.status === 'confirmed') {
      await query(
        `UPDATE payments p
         SET status = 'completed'
         FROM blockchain_transactions bt
         WHERE bt.txid = $1 AND bt.payment_id = p.id`,
        [txid]
      );
    }
  }

  /**
   * Get address transaction history
   */
  async getAddressHistory(address: string): Promise<Transaction[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/address/${address}/history`);
      return response.data.transactions;
    } catch (error) {
      throw new AppError('Failed to fetch address history', 500);
    }
  }

  /**
   * Sync wallet balance from blockchain
   */
  async syncWalletBalance(address: string, tenantId: string): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/address/${address}/balance`);

      await query(
        `UPDATE tenant_wallets
         SET balance_satoshis = $1, last_sync_at = NOW()
         WHERE address = $2 AND tenant_id = $3`,
        [response.data.balance, address, tenantId]
      );
    } catch (error) {
      throw new AppError('Failed to sync wallet balance', 500);
    }
  }
}
```

**File 3: `backend/src/services/teranodeService.ts`**

```typescript
/**
 * Teranode Service
 * High-performance BSV node interactions
 */

import axios from 'axios';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

export class TeranodeService {
  private rpcUrl: string;
  private apiKey: string;

  constructor() {
    this.rpcUrl = config.TERANODE_RPC_URL || '';
    this.apiKey = config.TERANODE_API_KEY || '';

    if (!this.rpcUrl || !this.apiKey) {
      throw new AppError('Teranode not configured', 500);
    }
  }

  /**
   * Broadcast transaction to BSV network
   */
  async broadcastTransaction(rawTx: string): Promise<string> {
    try {
      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'sendrawtransaction',
          params: [rawTx],
          id: Date.now(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (response.data.error) {
        throw new AppError(response.data.error.message, 500);
      }

      return response.data.result;  // Returns txid
    } catch (error: any) {
      throw new AppError(`Broadcast failed: ${error.message}`, 500);
    }
  }

  /**
   * Get transaction by txid
   */
  async getTransaction(txid: string): Promise<any> {
    try {
      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'getrawtransaction',
          params: [txid, true],  // true = verbose output
          id: Date.now(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.result;
    } catch (error: any) {
      throw new AppError(`Get transaction failed: ${error.message}`, 500);
    }
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    try {
      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'getblockcount',
          params: [],
          id: Date.now(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.result;
    } catch (error: any) {
      throw new AppError(`Get block height failed: ${error.message}`, 500);
    }
  }
}
```

**File 4: `backend/src/services/blockchainPaymentService.ts`**

```typescript
/**
 * Blockchain Payment Service
 * Orchestrates BSV/MNEE payments
 */

import { BRC100WalletService } from './brc100WalletService';
import { JungleBusService } from './junglebusService';
import { TeranodeService } from './teranodeService';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface CreatePaymentRequest {
  tenantId: string;
  studentId: string;
  lessonId?: string;
  amount: number;  // In dollars
  paymentMethod: 'bsv' | 'mnee';
}

export class BlockchainPaymentService {
  private walletService: BRC100WalletService;
  private junglebusService: JungleBusService;
  private teranodeService: TeranodeService;

  constructor() {
    this.walletService = new BRC100WalletService();
    this.junglebusService = new JungleBusService();
    this.teranodeService = new TeranodeService();
  }

  /**
   * Initialize blockchain payment
   */
  async createPayment(request: CreatePaymentRequest): Promise<{
    paymentId: string;
    address: string;
    amount: number;
    qrCode: string;
    expiresAt: Date;
  }> {
    // Convert USD to satoshis
    const amountSatoshis = await this.convertToSatoshis(request.amount, request.paymentMethod);

    // Create payment record
    const paymentResult = await query(
      `INSERT INTO payments (tenant_id, student_id, lesson_id, amount, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [request.tenantId, request.studentId, request.lessonId, request.amount, request.paymentMethod]
    );
    const paymentId = paymentResult.rows[0].id;

    // Generate payment request
    const tokenId = request.paymentMethod === 'mnee' ? process.env.MNEE_TOKEN_ID : undefined;
    const paymentRequest = await this.walletService.createPaymentRequest({
      tenantId: request.tenantId,
      recipientAddress: '',  // Will be generated
      amountSatoshis,
      tokenId,
      metadata: {
        paymentId,
        lessonId: request.lessonId,
        studentId: request.studentId,
      },
    });

    // Create blockchain transaction record
    await query(
      `INSERT INTO blockchain_transactions (tenant_id, payment_id, recipient_address, amount_satoshis, token_id, token_symbol, network, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [
        request.tenantId,
        paymentId,
        paymentRequest.address,
        amountSatoshis,
        tokenId,
        request.paymentMethod.toUpperCase(),
        process.env.BSV_NETWORK || 'testnet',
      ]
    );

    // Start monitoring address
    await this.junglebusService.monitorAddress(paymentRequest.address, request.tenantId);

    // Payment expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    return {
      paymentId,
      address: paymentRequest.address,
      amount: amountSatoshis,
      qrCode: paymentRequest.qrData,
      expiresAt,
    };
  }

  /**
   * Convert USD to satoshis based on current exchange rate
   */
  private async convertToSatoshis(usdAmount: number, currency: 'bsv' | 'mnee'): Promise<number> {
    if (currency === 'mnee') {
      // MNEE is 1:1 USD pegged
      return Math.round(usdAmount * 1e8);  // Convert to satoshis
    }

    // For BSV, fetch current exchange rate
    // TODO: Integrate with price oracle
    const bsvPriceUsd = 50;  // Placeholder - should fetch real-time
    const bsvAmount = usdAmount / bsvPriceUsd;
    return Math.round(bsvAmount * 1e8);
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(paymentId: string): Promise<{
    status: string;
    txid?: string;
    confirmations?: number;
  }> {
    const result = await query(
      `SELECT bt.txid, bt.status, bt.confirmations
       FROM blockchain_transactions bt
       WHERE bt.payment_id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Payment not found', 404);
    }

    return {
      status: result.rows[0].status,
      txid: result.rows[0].txid,
      confirmations: result.rows[0].confirmations,
    };
  }
}
```

### Step 6: Frontend Wallet Integration

**File: `frontend/src/lib/bsv.ts`**

```typescript
/**
 * BSV Frontend Library
 * BRC-100 wallet interactions
 */

import { Transaction, PrivateKey } from '@bsv/sdk';

export interface PaymentRequest {
  address: string;
  amount: number;
  tokenId?: string;
  metadata?: Record<string, any>;
}

export class BSVWallet {
  /**
   * Request BRC-100 payment from user's wallet
   */
  static async requestPayment(request: PaymentRequest): Promise<string> {
    // Check if user has BRC-100 compatible wallet
    if (!(window as any).bsv) {
      throw new Error('No BSV wallet detected. Please install a BRC-100 compatible wallet.');
    }

    const wallet = (window as any).bsv;

    try {
      // Request transaction approval from wallet
      const tx = await wallet.requestTransaction({
        type: 'send',
        outputs: [
          {
            to: request.address,
            amount: request.amount,
            token: request.tokenId,
          },
        ],
        metadata: request.metadata,
      });

      // Broadcast transaction
      const txid = await wallet.broadcast(tx);
      return txid;
    } catch (error: any) {
      throw new Error(`Payment failed: ${error.message}`);
    }
  }

  /**
   * Get user's wallet address
   */
  static async getAddress(): Promise<string> {
    if (!(window as any).bsv) {
      throw new Error('No BSV wallet detected');
    }

    const wallet = (window as any).bsv;
    return await wallet.getAddress();
  }

  /**
   * Get user's wallet balance
   */
  static async getBalance(): Promise<{ bsv: number; tokens: any[] }> {
    if (!(window as any).bsv) {
      throw new Error('No BSV wallet detected');
    }

    const wallet = (window as any).bsv;
    return await wallet.getBalance();
  }

  /**
   * Check if wallet is connected
   */
  static isConnected(): boolean {
    return !!(window as any).bsv;
  }
}
```

### Step 7: API Routes

**File: `backend/src/routes/blockchainRoutes.ts`**

```typescript
/**
 * Blockchain Payment Routes
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { asyncHandler } from '../middleware/errorHandler';
import { BlockchainPaymentService } from '../services/blockchainPaymentService';
import { JungleBusService } from '../services/junglebusService';
import { getTenantId } from '../middleware/tenantContext';

const router = Router();
const paymentService = new BlockchainPaymentService();
const junglebusService = new JungleBusService();

// Apply auth to all routes
router.use(authenticate);
router.use(requireTenantContext);

/**
 * Create blockchain payment
 */
router.post(
  '/blockchain/payments',
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { studentId, lessonId, amount, paymentMethod } = req.body;

    const payment = await paymentService.createPayment({
      tenantId,
      studentId,
      lessonId,
      amount,
      paymentMethod,
    });

    res.json({
      success: true,
      data: payment,
    });
  })
);

/**
 * Get payment status
 */
router.get(
  '/blockchain/payments/:paymentId',
  asyncHandler(async (req, res) => {
    const { paymentId } = req.params;
    const status = await paymentService.getPaymentStatus(paymentId);

    res.json({
      success: true,
      data: status,
    });
  })
);

/**
 * Webhook for JungleBus transaction notifications
 */
router.post(
  '/blockchain/webhook/:tenantId',
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { txid } = req.body;

    await junglebusService.handleTransactionWebhook(txid, tenantId);

    res.json({ success: true });
  })
);

export default router;
```

**Register in `backend/src/app.ts`:**
```typescript
import blockchainRoutes from './routes/blockchainRoutes';
app.use(API_PREFIX, blockchainRoutes);
```

---

## Testing Plan

### Testnet Testing Checklist

- [ ] Generate testnet wallet for tenant
- [ ] Request testnet BSV from faucet
- [ ] Create payment request
- [ ] Send testnet BSV to payment address
- [ ] Verify JungleBus detects transaction
- [ ] Confirm payment status updates
- [ ] Verify database records
- [ ] Test MNEE stablecoin payment
- [ ] Test BRC-100 token transfer
- [ ] Load test with 100 concurrent payments

### Testnet Resources

- **BSV Testnet Faucet:** https://faucet.bitcoincloud.net/
- **Teranode Testnet:** https://teranode.io/testnet
- **GorillaPool Testnet:** https://testnet.gorillapool.io/

---

## Security Considerations

### Critical Security Measures

1. **HD Wallet Seed Protection**
   - Never commit `BSV_HD_SEED` to Git
   - Use environment variables only
   - Encrypt at rest if storing in database
   - Use hardware security module (HSM) in production

2. **API Key Security**
   - Rotate Teranode API keys regularly
   - Rate limit blockchain endpoints
   - Monitor for unusual transaction patterns

3. **Payment Validation**
   - Require minimum 6 confirmations for large payments
   - Implement timeout for payment requests (1 hour)
   - Verify payment amounts match expected values
   - Check for double-spend attempts

4. **Webhook Security**
   - Validate webhook signatures from JungleBus
   - Implement replay attack prevention
   - Use HTTPS only for webhook callbacks

---

## Cost Analysis

### Operational Costs

| Service | Cost | Notes |
|---------|------|-------|
| **Teranode RPC** | $50-200/month | Based on API call volume |
| **JungleBus Indexing** | Free (self-hosted) | Docker container |
| **BSV Transaction Fees** | ~$0.0001/tx | Negligible |
| **MNEE Transaction Fees** | $0 | Zero-fee stablecoin |
| **Infrastructure** | $20-50/month | Docker hosting |

**Total Estimated:** $70-250/month

### Revenue Model

- **Transaction Fee:** 1-2% on blockchain payments
- **Premium Feature:** Blockchain payments in Enterprise tier only
- **Break-even:** ~100-200 blockchain transactions/month

---

## Rollout Plan

### Phase 6A: Foundation (Week 1-2)
- Install dependencies
- Set up Docker infrastructure
- Create database migrations
- Implement core services

### Phase 6B: Integration (Week 3-4)
- Wire up API routes
- Build frontend wallet UI
- Testnet testing
- Bug fixes

### Phase 6C: Pilot (Week 5-6)
- Select 3-5 pilot tenants
- Enable testnet payments
- Monitor and iterate
- Gather feedback

### Phase 6D: Production (Week 7-8)
- Security audit
- Mainnet deployment
- Documentation
- Training materials

---

## Success Metrics

### Technical Metrics
- Transaction confirmation time < 30 seconds
- API response time < 200ms
- 99.9% uptime for payment processing
- Zero double-spend incidents

### Business Metrics
- 10% of tenants adopt blockchain payments in Q1
- Average transaction value $50+
- 95% payment success rate
- Reduced payment processing costs by 50%

---

## Resources & References

### Official Documentation
- **BSV Specifications:** https://docs.bsvblockchain.org/
- **BRC-100 Standard:** https://github.com/bitcoin-sv/BRCs/blob/master/peer-to-peer/0100.md
- **Babbage SDK:** https://projectbabbage.com/docs
- **Teranode:** https://teranode.io/docs
- **GorillaPool:** https://docs.gorillapool.io/

### Community Resources
- **BSV Association:** https://www.bsvblockchain.org/
- **BSV Developers:** https://discord.gg/bsv
- **Project Babbage:** https://twitter.com/ProjectBabbage

---

## Appendix

### Glossary

- **BSV:** Bitcoin SV (Satoshi Vision) blockchain
- **BRC-100:** Bitcoin Request for Comment 100 - Token standard
- **Teranode:** High-performance BSV node implementation
- **JungleBus:** Real-time BSV transaction indexer by GorillaPool
- **MNEE:** USD-pegged stablecoin on BSV
- **Satoshi:** Smallest unit of BSV (1 BSV = 100,000,000 satoshis)
- **HD Wallet:** Hierarchical Deterministic wallet (BIP32/BIP44)

### FAQ

**Q: Why BSV over BTC or ETH?**
A: BSV offers near-zero fees, instant transactions, and unbounded scaling via Teranode.

**Q: What's the difference between BSV and MNEE payments?**
A: BSV is volatile cryptocurrency; MNEE is 1:1 USD pegged stablecoin (better for lesson payments).

**Q: Do students need a wallet?**
A: Yes, students need a BRC-100 compatible wallet (e.g., HandCash, RelayX, Yours Wallet).

**Q: What happens if a payment fails?**
A: Payment expires after 1 hour; student can retry or use alternate payment method.

**Q: Can we refund blockchain payments?**
A: Yes, by sending a reverse transaction to the student's wallet address.

---

**Document Version:** 1.0
**Last Updated:** November 8, 2025
**Next Review:** After Phase 4B completion
**Owner:** Development Team
**Status:** Ready for Implementation

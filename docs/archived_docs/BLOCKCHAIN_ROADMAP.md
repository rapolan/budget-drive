# Blockchain Integration Roadmap - BSV Overlay Services

**Version:** 2.0
**Last Updated:** January 2026
**Status:** Phase 2 Planning
**Authoritative Reference:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Important Corrections

> **Note:** Version 1.0 of this document incorrectly described BRC-100 as a "token standard."
> BRC-100 is actually the **Wallet-to-Application Interface** standard.
> See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the correct technical specifications.

---

## Executive Summary

Budget Drive Protocol (BDP) integrates with BSV Blockchain using the **Overlay Services** architecture:

- **Overlay Express** - Server framework for Topic Managers and Lookup Services
- **BRC-100 Wallet** - Standardized wallet-to-app communication
- **SHIP/SLAP Protocols** - Transaction broadcasting and service discovery
- **Hybrid Storage** - PostgreSQL (operational) + Blockchain (financial/audit)

---

## BSV Standards Used

| Standard | Name | Purpose in BDP |
|----------|------|----------------|
| **BRC-100** | Wallet Interface | Frontend wallet integration |
| **BRC-42** | Key Derivation | Cryptographic key management |
| **BRC-52** | Identity Certificates | Student/instructor credentials |
| **BRC-22** | Overlay Data Sync (SHIP) | Transaction broadcasting |
| **BRC-24** | Lookup Services (SLAP) | Querying overlay data |
| **BRC-64** | Transaction Tracking | Audit trail management |

---

## Current Status

### Phase 1 - Complete (80%)

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant PostgreSQL | ✅ | 23 migrations applied |
| REST API (60+ endpoints) | ✅ | Express + TypeScript |
| React Frontend | ✅ | Vite + Tailwind |
| Smart Scheduling (6D) | ✅ | Patent Claim #1 |
| Treasury DB Tracking | ✅ | Fees recorded, not on-chain |
| BSV Wallet Service | ✅ | P2PKH transactions working |
| First Testnet TX | ✅ | Nov 18, 2025 |

### Phase 2 - In Progress (Foundation)

| Feature | Status | Target | Notes |
|---------|--------|--------|-------|
| Overlay Express Setup | 🔄 | Q1 2026 | Blockchain infrastructure |
| Topic Managers | 🔄 | Q1 2026 | Lesson/payment tracking |
| Lookup Services | 🔄 | Q1 2026 | Query layer |
| BRC-100 Frontend Wallet | ⏳ | Q1 2026 | User wallet integration |
| LARS Local Development | ⏳ | Q1 2026 | Dev environment |
| **Goal: 100 schools, $0 fees** | ⏳ | Q2 2026 | Adoption over revenue |

### Phase 2.5 - ACO Infrastructure (Q3 2026)

| Feature | Status | Target | Purpose |
|---------|--------|--------|----------|
| Schema.org structured data | ⏳ | Q3 2026 | AI-readable profiles |
| GraphQL API | ⏳ | Q3 2026 | Flexible queries |
| Certainty score endpoints | ⏳ | Q3 2026 | AI decision-making |
| Blockchain verification API | ⏳ | Q3 2026 | Instant credential checks |
| **Turn on micropayments (2 sats)** | ⏳ | Q3 2026 | First revenue |
| **Goal: 1,000 schools** | ⏳ | Q4 2026 | Critical mass |

### Phase 3 - AI Agent Ecosystem (2027)

| Feature | Status | Target | Revenue Impact |
|---------|--------|--------|----------------|
| Payment channel infrastructure | ⏳ | Q1 2027 | Enable AI micropayments |
| AI agent authentication (OAuth) | ⏳ | Q1 2027 | Secure API access |
| Partner with ChatGPT/Claude | ⏳ | Q2 2027 | AI ecosystem adoption |
| Real-time data feeds | ⏳ | Q2 2027 | Premium revenue |
| **Increase fees to 5 sats** | ⏳ | Q3 2027 | Normal rates |
| **Goal: 10,000 schools** | ⏳ | Q4 2027 | $1M+ passive income |

### Phase 4 - Market Dominance (2028+)

| Feature | Status | Target | Impact |
|---------|--------|--------|---------|
| 50,000+ schools (national) | ⏳ | 2028 | Market leader |
| AI query volume: 100M/month | ⏳ | 2028 | $5M+/year passive |
| Insurance/DMV integrations | ⏳ | 2028 | Enterprise revenue |
| Cross-school marketplace | ⏳ | 2028 | Network effects |
| Open protocol (BRC standard) | ⏳ | 2029 | Ecosystem play |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│  + BRC-100 Wallet (createAction, signAction)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   OVERLAY EXPRESS                            │
│                                                              │
│  Topic Managers          Lookup Services                    │
│  ├─ tm_bdp_lessons       ├─ ls_bdp_lessons                 │
│  ├─ tm_bdp_payments      ├─ ls_bdp_payments                │
│  ├─ tm_bdp_certs         ├─ ls_bdp_certs                   │
│  └─ tm_bdp_treasury      └─ ls_bdp_treasury                │
│                                                              │
│  Protocols: SHIP | SLAP | GASP                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   HYBRID DATA LAYER                          │
│                                                              │
│  PostgreSQL              MongoDB              BSV Blockchain │
│  (Operational)           (Overlay Index)      (Financial)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Protocol Fee Schedule

| Protocol Prefix | Action | Fee (sats) | USD (~$50/BSV) |
|-----------------|--------|------------|----------------|
| `BDP_BOOK` | Lesson booking | 5 | ~$0.0000025 |
| `BDP_PAY` | Payment record | 3 | ~$0.0000015 |
| `BDP_CERT` | Certificate | 10 | ~$0.0000050 |
| `BDP_NOTIFY` | Notification | 1 | ~$0.0000005 |
| `BDP_PROGRESS` | Progress update | 2 | ~$0.0000010 |
| `BDP_AVAIL` | Availability | 1 | ~$0.0000005 |

---

## Micropayment Revenue Strategy

### **The Phased Rollout (Don't Charge Too Early!)**

| Phase | Schools | Strategy | Fees | Revenue Goal |
|-------|---------|----------|------|-------------|
| **Phase 1** (Now - 100 schools) | 1-100 | Adoption > Revenue | **$0** for everything | Get users, build data |
| **Phase 2** (Late 2026) | 100-1,000 | Low friction fees | **2 sats** per action | $25,000-$100,000/year |
| **Phase 3** (2027) | 1,000-10,000 | Normal rates + AI APIs | **5 sats** per action | $250,000-$1,000,000/year |
| **Phase 4** (2028+) | 10,000+ | Full passive income | **5-10 sats** + AI ecosystem | $1,000,000+/year |

---

### **Recommended Fee Schedule (When You Turn On Payments)**

#### **Human-Driven Actions (Start Low, Increase Later):**

| Action | Phase 1 (Free) | Phase 2 (Low) | Phase 3 (Normal) | Phase 4 (Mature) |
|--------|---------------|---------------|------------------|------------------|
| Lesson booking | $0 | 2 sats | 5 sats | 5 sats |
| Notifications | $0 | 0.5 sats | 1 sat | 1 sat |
| Certificates | $0 | 5 sats | 10 sats | 10 sats |
| Progress updates | $0 | 1 sat | 2 sats | 2 sats |

**Why start low?** Humans notice fees. Need adoption first, revenue later.

#### **AI-Driven Queries (Can Start Higher - AI Doesn't Care):**

| Query Type | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------------|---------|---------|---------|----------|
| Basic search | $0 | N/A | 0.5 sats | 0.5 sats |
| Credential verification | $0 | N/A | 1 sat | 1 sat |
| Availability check | $0 | N/A | 0.5 sats | 0.5 sats |
| Premium queries | $0 | N/A | 5 sats | 10 sats |

**Why can charge more?** AI has query budgets. 1 sat = $0.0000005 - they can't feel it.

---

### **Critical Mass Thresholds**

**When micropayments become meaningful:**

| Schools | Monthly Revenue | Viable? | Strategy |
|---------|-----------------|---------|----------|
| 1 | $0.38 | ❌ No | Don't charge yet |
| 10 | $3.80 | ❌ No | Don't charge yet |
| 100 | $75 | ⚠️ Barely | Turn on at 2 sats |
| 1,000 | $8,000 | ✅ YES | Normal rates (5 sats) |
| 10,000 | $80,000 | ✅ Hell yes | Full passive income model |

**The Rule:** Don't charge micropayments until you have 100+ schools minimum.

---

### **Payment Channel Setup (Technical)**

**For AI agents to pay micropayments:**

```javascript
// AI Agent creates payment channel
const channel = await bsv.createPaymentChannel({
  recipient: 'bdp-api-wallet-address',
  amount: 10000, // sats
  duration: 30 * 24 * 60 * 60 // 30 days
});

// Make queries with automatic micropayments
const response = await fetch('https://api.budgetdrive.com/v1/search', {
  headers: {
    'X-Payment-Channel': channel.id,
    'X-Max-Query-Cost': 1 // sats
  }
});

// Response includes actual cost
console.log(response.headers['X-Query-Cost']); // 0.5 sats
// Money deducted automatically from channel
```

**Your API implementation:**

```javascript
// Middleware to check payment channel and deduct fee
app.use(async (req, res, next) => {
  const channelId = req.headers['x-payment-channel'];
  const queryCost = 0.5; // sats
  
  const channel = await paymentChannels.get(channelId);
  if (channel.balance < queryCost) {
    return res.status(402).json({ error: 'Insufficient balance' });
  }
  
  await channel.deduct(queryCost);
  res.setHeader('X-Query-Cost', queryCost);
  next();
});
```

---

## Implementation Plan

### Step 1: Install Dependencies

```bash
# Backend
cd backend
npm install @bsv/sdk @bsv/overlay @bsv/overlay-express mongodb

# Frontend
cd frontend
npm install @bsv/sdk

# Development tools (global)
npm install -g @bsv/lars
```

### Step 2: Create Overlay Structure

```
backend/src/overlay/
├── server.ts                    # Overlay Express entry point
├── topic-managers/
│   ├── lessons.ts               # tm_bdp_lessons
│   ├── payments.ts              # tm_bdp_payments
│   ├── certificates.ts          # tm_bdp_certs
│   └── treasury.ts              # tm_bdp_treasury
└── lookup-services/
    ├── lessons.ts               # ls_bdp_lessons
    ├── payments.ts              # ls_bdp_payments
    ├── certificates.ts          # ls_bdp_certs
    └── treasury.ts              # ls_bdp_treasury
```

### Step 3: Configure deployment-info.json

See [deployment-info.json](deployment-info.json) in project root.

### Step 4: Run Local Development

```bash
# Start LARS (handles Docker, databases, ngrok)
npx lars

# LARS will:
# 1. Start MySQL + MongoDB containers
# 2. Launch Overlay Express with your Topic Managers
# 3. Create ngrok tunnel for external access
# 4. Watch for code changes
```

### Step 5: Frontend Wallet Integration

```typescript
import { BDPWallet } from './lib/wallet';

const wallet = new BDPWallet();
await wallet.connect();

// Book a lesson (triggers BRC-100 wallet approval)
const txid = await wallet.createLessonBooking({
  tenantId: '...',
  studentId: '...',
  instructorId: '...',
  scheduledStart: '2026-01-25T10:00:00Z',
  scheduledEnd: '2026-01-25T12:00:00Z'
});
```

---

## Testing Checklist

### Testnet Testing

- [ ] LARS environment starts successfully
- [ ] Topic Managers register with SLAP
- [ ] Create lesson via BRC-100 wallet
- [ ] Verify transaction admitted by tm_bdp_lessons
- [ ] Query lesson via ls_bdp_lessons
- [ ] Confirm PostgreSQL + Overlay in sync
- [ ] Test certificate issuance (BRC-52)
- [ ] Verify treasury fee accumulation

### Production Readiness

- [ ] CARS deployment configured
- [ ] Mainnet keys generated (HSM)
- [ ] Admin token secured
- [ ] Rate limiting enabled
- [ ] Monitoring/alerting setup
- [ ] Backup strategy documented

---

## Security Considerations

### Key Management

| Key Type | Storage | Access |
|----------|---------|--------|
| Node Private Key | Environment variable | Server only |
| Admin Token | Environment variable | Admin endpoints |
| User Keys | BRC-100 Wallet | User-controlled |

### Best Practices

1. **Never** commit private keys to Git
2. **Always** use HTTPS for overlay endpoints
3. **Validate** all transaction data in Topic Managers
4. **Rate limit** API endpoints
5. **Monitor** for unusual transaction patterns

---

## Resources

### Official Documentation

- [BSV SDK Documentation](https://docs.bsvblockchain.org/)
- [BRC Standards](https://bsv.brc.dev/)
- [Overlay Services](https://github.com/bsv-blockchain/overlay-services)
- [Overlay Express](https://github.com/bsv-blockchain/overlay-express)
- [LARS](https://github.com/bitcoin-sv/lars)
- [Project Babbage](https://docs.projectbabbage.com)

### Testnet Resources

- **SLAP Tracker:** testnet-users.bapp.dev
- **ARC:** arc-testnet.taal.com
- **Explorer:** test.whatsonchain.com
- **Faucet:** faucet.bitcoincloud.net

---

## Glossary

| Term | Definition |
|------|------------|
| **BRC-100** | Wallet-to-Application Interface standard (NOT a token standard) |
| **SHIP** | Synchronizes Hosting for Indexing Peers (broadcast protocol) |
| **SLAP** | Service Lookup Availability Protocol (discovery) |
| **GASP** | General Attestation and Synchronization Protocol |
| **BEEF** | Background Evaluation Extended Format (transaction envelope) |
| **STEAK** | Submitted Transaction Execution AcKnowledgment |
| **Topic Manager** | Decides which outputs are admitted to overlay |
| **Lookup Service** | Answers queries about overlay data |
| **LARS** | Local Automated Runtime System (dev tool) |
| **CARS** | Cloud Automated Runtime System (deployment) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Jan 2026 | Complete rewrite with correct BRC standards |
| 1.0 | Nov 2025 | Initial (incorrect BRC-100 description) |

---

**For detailed technical specifications, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

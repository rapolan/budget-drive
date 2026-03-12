# Budget Drive Protocol (BDP) - Technical Architecture

**Version:** 2.0
**Last Updated:** January 2026
**Status:** Authoritative Reference Document

---

## Table of Contents

1. [Overview](#overview)
2. [BSV Standards Clarification](#bsv-standards-clarification)
3. [System Architecture](#system-architecture)
4. [Overlay Services Architecture](#overlay-services-architecture)
5. [Topic Managers](#topic-managers)
6. [Lookup Services](#lookup-services)
7. [BRC-100 Wallet Integration](#brc-100-wallet-integration)
8. [Data Flow](#data-flow)
9. [Development Stack](#development-stack)
10. [Migration Path](#migration-path)

---

## Overview

Budget Drive Protocol (BDP) is a multi-tenant driving school management platform built on BSV Blockchain using the **Overlay Services architecture**. This document provides the authoritative technical reference for the system.

### Core Principles

1. **Micropayment-First** - Satoshi-level fees (1-10 sats per action)
2. **No Chokepoints** - Peer-to-peer, no gatekeepers
3. **On-Chain Transparency** - Verifiable, auditable records
4. **Horizontal Scalability** - Unlimited growth capacity

---

## BSV Standards Clarification

**IMPORTANT:** Previous documentation incorrectly described BRC-100 as a "token standard." This section corrects that misunderstanding.

### What BRC-100 Actually Is

**BRC-100** is the **Unified Wallet-to-Application Interface** standard. It defines:

- How applications communicate with BSV wallets
- Standardized methods: `createAction`, `signAction`, `encrypt`, `decrypt`, `getPublicKey`
- Security levels and permission models
- Certificate handling (BRC-52 integration)

**BRC-100 is NOT:**
- A token standard
- A payment protocol
- An overlay network specification

### The Complete BRC Stack for BDP

| Standard | Name | Purpose | BDP Usage |
|----------|------|---------|-----------|
| **BRC-100** | Wallet Interface | App-to-wallet communication | User authentication, signing |
| **BRC-42** | Key Derivation (BKDS) | Cryptographic key generation | Wallet key management |
| **BRC-43** | Security Levels | Permission hierarchy | Access control |
| **BRC-52** | Identity Certificates | Verifiable credentials | Instructor/student certificates |
| **BRC-22** | Overlay Data Sync | SHIP protocol | Transaction broadcasting |
| **BRC-24** | Lookup Services | SLAP protocol | Querying overlay data |
| **BRC-64** | Transaction Tracking | History management | Audit trails |
| **BRC-65** | Labels & Actions | Transaction categorization | Lesson/payment tagging |

### Overlay Network Standards

| Protocol | Full Name | Purpose |
|----------|-----------|---------|
| **SHIP** | Synchronizes Hosting for Indexing Peers | Broadcasting transactions to overlay |
| **SLAP** | Service Lookup Availability Protocol | Discovering lookup services |
| **GASP** | General Attestation and Synchronization Protocol | State synchronization |
| **BEEF** | Background Evaluation Extended Format | Transaction envelope |
| **STEAK** | Submitted Transaction Execution AcKnowledgment | Broadcast confirmation |

---

## System Architecture

### Current Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│  React 18 + TypeScript + Vite + Tailwind CSS                │
│  Pages: Dashboard, Students, Instructors, Lessons, etc.     │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API (60+ endpoints)
┌─────────────────────────▼───────────────────────────────────┐
│                     BACKEND (Express)                        │
│  Node.js 18 + TypeScript                                    │
│  Controllers → Services → Database                          │
│                                                              │
│  Services:                                                   │
│  - lessonService      - paymentService                      │
│  - studentService     - instructorService                   │
│  - schedulingService  - treasuryService (DB-only)          │
│  - walletService      - notificationService                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    PostgreSQL                                │
│  Multi-tenant isolation (tenant_id on all tables)           │
│  23+ migrations applied                                      │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (Phase 2+)

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│  + BRC-100 Wallet Integration (MetaNet Client)              │
│  + createAction() / signAction() for transactions           │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   OVERLAY EXPRESS                            │
│               (@bsv/overlay-express)                         │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Topic Managers  │  │  Lookup Services │                │
│  │                  │  │                  │                │
│  │  tm_bdp_lessons  │  │  ls_bdp_lessons  │                │
│  │  tm_bdp_payments │  │  ls_bdp_payments │                │
│  │  tm_bdp_certs    │  │  ls_bdp_certs    │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  SHIP ←──→ SLAP ←──→ GASP                                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│              HYBRID DATA LAYER                               │
│                                                              │
│  PostgreSQL (Operational)     BSV Blockchain (Financial)    │
│  - Student PII                - Treasury transactions       │
│  - Scheduling data            - Payment proofs              │
│  - Session state              - Certificates                │
│  - Search indices             - Audit trail                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Overlay Services Architecture

### What Goes Where

| Data Type | Storage | Reason |
|-----------|---------|--------|
| Student PII (name, email, phone) | PostgreSQL | Privacy, GDPR compliance |
| Lesson schedules | PostgreSQL + Overlay | Operational speed + verification |
| Payment records | PostgreSQL + Blockchain | Financial auditability |
| Treasury fees | Blockchain only | Protocol revenue, transparency |
| Certificates | Blockchain (BRC-52) | Immutable credentials |
| Instructor availability | PostgreSQL | Real-time updates needed |
| Audit trail | Blockchain | Tamper-proof history |

### Overlay Express Configuration

```typescript
// backend/src/overlay/server.ts
import { OverlayExpress } from '@bsv/overlay-express';
import { BDPLessonTopicManager } from './topic-managers/lessons';
import { BDPPaymentTopicManager } from './topic-managers/payments';
import { BDPCertificateTopicManager } from './topic-managers/certificates';
import { BDPLessonLookupService } from './lookup-services/lessons';
import { BDPPaymentLookupService } from './lookup-services/payments';

const overlay = new OverlayExpress('bdp-node', {
  privateKey: process.env.BSV_NODE_PRIVATE_KEY,
  hostingURL: process.env.OVERLAY_HOSTING_URL
});

// Configure port
overlay.configurePort(8080);

// Configure databases
overlay.configureKnex(process.env.KNEX_DB_CONNECTION);
overlay.configureMongo(process.env.MONGO_DB_CONNECTION);

// Register Topic Managers
overlay.configureTopicManager('tm_bdp_lessons', new BDPLessonTopicManager());
overlay.configureTopicManager('tm_bdp_payments', new BDPPaymentTopicManager());
overlay.configureTopicManager('tm_bdp_certs', new BDPCertificateTopicManager());

// Register Lookup Services
overlay.configureLookupServiceWithMongo(
  'ls_bdp_lessons',
  new BDPLessonLookupService()
);
overlay.configureLookupServiceWithMongo(
  'ls_bdp_payments',
  new BDPPaymentLookupService()
);

// Enable sync protocols
overlay.configureEnableGASPSync(true);

// Start
await overlay.configureEngine();
await overlay.start();
```

---

## Topic Managers

Topic Managers decide **which transaction outputs get admitted** to the overlay.

### tm_bdp_lessons

Manages lesson booking transactions.

```typescript
// backend/src/overlay/topic-managers/lessons.ts
import { TopicManager, AdmittanceInstructions } from '@bsv/overlay';
import { Transaction } from '@bsv/sdk';

export class BDPLessonTopicManager implements TopicManager {

  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {

    const tx = Transaction.fromBEEF(beef);
    const validOutputs: number[] = [];

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];

      // Check if output contains BDP lesson data
      if (this.isBDPLessonOutput(output)) {
        // Validate lesson structure
        const lessonData = this.parseLessonData(output);

        if (this.validateLesson(lessonData)) {
          validOutputs.push(i);
        }
      }
    }

    return {
      outputsToAdmit: validOutputs,
      coinsToRetain: previousCoins
    };
  }

  private isBDPLessonOutput(output: any): boolean {
    // Check for BDP_LESSON protocol prefix in OP_RETURN
    const script = output.lockingScript;
    return script.toASM().includes('OP_RETURN') &&
           script.toASM().includes('BDP_LESSON');
  }

  private parseLessonData(output: any): BDPLessonData {
    // Parse OP_RETURN data
    const script = output.lockingScript;
    const data = script.chunks[1]?.data;
    return JSON.parse(Buffer.from(data).toString());
  }

  private validateLesson(data: BDPLessonData): boolean {
    return !!(
      data.tenantId &&
      data.studentId &&
      data.instructorId &&
      data.scheduledStart &&
      data.scheduledEnd &&
      data.protocolFee >= 5 // Minimum 5 sats
    );
  }

  getDocumentation(): string {
    return `
      # BDP Lesson Topic Manager

      Admits lesson booking transactions to the BDP overlay.

      ## Required Fields
      - tenantId: UUID
      - studentId: UUID
      - instructorId: UUID
      - scheduledStart: ISO timestamp
      - scheduledEnd: ISO timestamp
      - protocolFee: number (minimum 5 sats)

      ## Protocol Prefix
      BDP_LESSON
    `;
  }

  getMetaData(): any {
    return {
      name: 'BDP Lesson Topic Manager',
      version: '1.0.0',
      protocolPrefix: 'BDP_LESSON'
    };
  }
}

interface BDPLessonData {
  tenantId: string;
  studentId: string;
  instructorId: string;
  vehicleId?: string;
  scheduledStart: string;
  scheduledEnd: string;
  protocolFee: number;
  pickupAddress?: string;
  notes?: string;
}
```

### tm_bdp_payments

Manages payment transaction records.

```typescript
// backend/src/overlay/topic-managers/payments.ts
import { TopicManager, AdmittanceInstructions } from '@bsv/overlay';

export class BDPPaymentTopicManager implements TopicManager {

  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {

    const tx = Transaction.fromBEEF(beef);
    const validOutputs: number[] = [];

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];

      if (this.isBDPPaymentOutput(output)) {
        const paymentData = this.parsePaymentData(output);

        if (this.validatePayment(paymentData)) {
          validOutputs.push(i);
        }
      }
    }

    return {
      outputsToAdmit: validOutputs,
      coinsToRetain: previousCoins
    };
  }

  private isBDPPaymentOutput(output: any): boolean {
    const script = output.lockingScript;
    return script.toASM().includes('OP_RETURN') &&
           script.toASM().includes('BDP_PAY');
  }

  private validatePayment(data: BDPPaymentData): boolean {
    return !!(
      data.tenantId &&
      data.amount > 0 &&
      data.protocolFee >= 3 // Minimum 3 sats for payments
    );
  }

  getDocumentation(): string {
    return `
      # BDP Payment Topic Manager

      Admits payment transactions to the BDP overlay.

      ## Protocol Prefix
      BDP_PAY
    `;
  }

  getMetaData(): any {
    return {
      name: 'BDP Payment Topic Manager',
      version: '1.0.0',
      protocolPrefix: 'BDP_PAY'
    };
  }
}

interface BDPPaymentData {
  tenantId: string;
  studentId: string;
  lessonId?: string;
  amount: number;
  currency: 'BSV' | 'MNEE' | 'USD';
  protocolFee: number;
}
```

### tm_bdp_certs

Manages certificate issuance (BRC-52 compliant).

```typescript
// backend/src/overlay/topic-managers/certificates.ts
import { TopicManager, AdmittanceInstructions } from '@bsv/overlay';

export class BDPCertificateTopicManager implements TopicManager {

  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {

    const tx = Transaction.fromBEEF(beef);
    const validOutputs: number[] = [];

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];

      if (this.isBDPCertificateOutput(output)) {
        const certData = this.parseCertificateData(output);

        if (this.validateCertificate(certData)) {
          validOutputs.push(i);
        }
      }
    }

    return {
      outputsToAdmit: validOutputs,
      coinsToRetain: previousCoins
    };
  }

  private isBDPCertificateOutput(output: any): boolean {
    const script = output.lockingScript;
    return script.toASM().includes('OP_RETURN') &&
           script.toASM().includes('BDP_CERT');
  }

  private validateCertificate(data: BDPCertificateData): boolean {
    return !!(
      data.type &&
      data.subjectId &&
      data.issuerId &&
      data.validFrom &&
      data.signature &&
      data.protocolFee >= 10 // 10 sats for certificates
    );
  }

  getDocumentation(): string {
    return `
      # BDP Certificate Topic Manager

      Admits certificate issuance transactions (BRC-52 compliant).

      ## Certificate Types
      - COMPLETION: Course completion certificate
      - LICENSE: Instructor license verification
      - HOURS: Logged driving hours

      ## Protocol Prefix
      BDP_CERT
    `;
  }

  getMetaData(): any {
    return {
      name: 'BDP Certificate Topic Manager',
      version: '1.0.0',
      protocolPrefix: 'BDP_CERT'
    };
  }
}

interface BDPCertificateData {
  type: 'COMPLETION' | 'LICENSE' | 'HOURS';
  subjectId: string;
  issuerId: string;
  tenantId: string;
  validFrom: string;
  validUntil?: string;
  fields: Record<string, any>;
  signature: string;
  protocolFee: number;
}
```

---

## Lookup Services

Lookup Services answer queries about data in the overlay.

### ls_bdp_lessons

```typescript
// backend/src/overlay/lookup-services/lessons.ts
import { LookupService, LookupQuestion, LookupAnswer } from '@bsv/overlay';

export class BDPLessonLookupService implements LookupService {

  private storage: MongoStorage;

  constructor(storage: MongoStorage) {
    this.storage = storage;
  }

  async lookup(question: LookupQuestion): Promise<LookupAnswer> {
    const query = question.query as LessonQuery;

    switch (query.type) {
      case 'by_student':
        return this.lookupByStudent(query.studentId);
      case 'by_instructor':
        return this.lookupByInstructor(query.instructorId);
      case 'by_tenant':
        return this.lookupByTenant(query.tenantId);
      case 'by_date_range':
        return this.lookupByDateRange(query.start, query.end, query.tenantId);
      default:
        throw new Error(`Unknown query type: ${query.type}`);
    }
  }

  private async lookupByStudent(studentId: string): Promise<LookupAnswer> {
    const lessons = await this.storage.find('lessons', { studentId });
    return {
      type: 'output-list',
      outputs: lessons.map(l => ({
        beef: l.beef,
        outputIndex: l.outputIndex
      }))
    };
  }

  private async lookupByInstructor(instructorId: string): Promise<LookupAnswer> {
    const lessons = await this.storage.find('lessons', { instructorId });
    return {
      type: 'output-list',
      outputs: lessons.map(l => ({
        beef: l.beef,
        outputIndex: l.outputIndex
      }))
    };
  }

  private async lookupByTenant(tenantId: string): Promise<LookupAnswer> {
    const lessons = await this.storage.find('lessons', { tenantId });
    return {
      type: 'output-list',
      outputs: lessons.map(l => ({
        beef: l.beef,
        outputIndex: l.outputIndex
      }))
    };
  }

  private async lookupByDateRange(
    start: string,
    end: string,
    tenantId: string
  ): Promise<LookupAnswer> {
    const lessons = await this.storage.find('lessons', {
      tenantId,
      scheduledStart: { $gte: start },
      scheduledEnd: { $lte: end }
    });
    return {
      type: 'output-list',
      outputs: lessons.map(l => ({
        beef: l.beef,
        outputIndex: l.outputIndex
      }))
    };
  }

  // Called when Topic Manager admits new outputs
  async handleNewOutput(output: any): Promise<void> {
    const lessonData = this.parseOutput(output);
    await this.storage.insert('lessons', {
      ...lessonData,
      beef: output.beef,
      outputIndex: output.outputIndex,
      txid: output.txid,
      indexedAt: new Date()
    });
  }

  getDocumentation(): string {
    return `
      # BDP Lesson Lookup Service

      Query lessons from the BDP overlay.

      ## Query Types
      - by_student: { type: 'by_student', studentId: string }
      - by_instructor: { type: 'by_instructor', instructorId: string }
      - by_tenant: { type: 'by_tenant', tenantId: string }
      - by_date_range: { type: 'by_date_range', start: string, end: string, tenantId: string }
    `;
  }

  getMetaData(): any {
    return {
      name: 'BDP Lesson Lookup Service',
      version: '1.0.0'
    };
  }
}

interface LessonQuery {
  type: 'by_student' | 'by_instructor' | 'by_tenant' | 'by_date_range';
  studentId?: string;
  instructorId?: string;
  tenantId?: string;
  start?: string;
  end?: string;
}
```

---

## BRC-100 Wallet Integration

### Frontend Wallet Connection

```typescript
// frontend/src/lib/wallet.ts
import { Wallet } from '@bsv/sdk';

export class BDPWallet {
  private wallet: Wallet | null = null;

  async connect(): Promise<boolean> {
    // Check for BRC-100 compliant wallet
    if (typeof window !== 'undefined' && (window as any).bsvWallet) {
      this.wallet = (window as any).bsvWallet;

      // Request authentication
      const authenticated = await this.wallet.isAuthenticated();
      if (!authenticated) {
        await this.wallet.waitForAuthentication();
      }

      return true;
    }

    throw new Error('No BRC-100 compatible wallet found. Please install MetaNet Client.');
  }

  async createLessonBooking(lessonData: LessonBookingData): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not connected');

    // Create action using BRC-100 interface
    const action = await this.wallet.createAction({
      description: `Book lesson: ${lessonData.studentName}`,
      outputs: [
        {
          // Protocol fee to BDP treasury
          satoshis: 5,
          script: this.buildLessonScript(lessonData),
          description: 'BDP Protocol Fee'
        }
      ],
      labels: ['bdp', 'lesson', lessonData.tenantId],
      options: {
        signAndProcess: true
      }
    });

    return action.txid;
  }

  async createPaymentRecord(paymentData: PaymentData): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not connected');

    const action = await this.wallet.createAction({
      description: `Payment: $${paymentData.amount}`,
      outputs: [
        {
          satoshis: 3,
          script: this.buildPaymentScript(paymentData),
          description: 'BDP Payment Record'
        }
      ],
      labels: ['bdp', 'payment', paymentData.tenantId]
    });

    return action.txid;
  }

  async issueCertificate(certData: CertificateData): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not connected');

    // Use BRC-52 certificate structure
    const certificate = await this.wallet.acquireCertificate({
      type: certData.type,
      certifier: certData.issuerId,
      fields: certData.fields,
      acquisitionProtocol: 'direct'
    });

    return certificate.txid;
  }

  private buildLessonScript(data: LessonBookingData): string {
    // OP_RETURN BDP_LESSON <json_data>
    const jsonData = JSON.stringify({
      protocol: 'BDP_LESSON',
      version: '1.0',
      tenantId: data.tenantId,
      studentId: data.studentId,
      instructorId: data.instructorId,
      vehicleId: data.vehicleId,
      scheduledStart: data.scheduledStart,
      scheduledEnd: data.scheduledEnd,
      protocolFee: 5
    });

    return `OP_FALSE OP_RETURN ${Buffer.from('BDP_LESSON').toString('hex')} ${Buffer.from(jsonData).toString('hex')}`;
  }

  private buildPaymentScript(data: PaymentData): string {
    const jsonData = JSON.stringify({
      protocol: 'BDP_PAY',
      version: '1.0',
      tenantId: data.tenantId,
      studentId: data.studentId,
      lessonId: data.lessonId,
      amount: data.amount,
      currency: data.currency,
      protocolFee: 3
    });

    return `OP_FALSE OP_RETURN ${Buffer.from('BDP_PAY').toString('hex')} ${Buffer.from(jsonData).toString('hex')}`;
  }
}

interface LessonBookingData {
  tenantId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  vehicleId?: string;
  scheduledStart: string;
  scheduledEnd: string;
}

interface PaymentData {
  tenantId: string;
  studentId: string;
  lessonId?: string;
  amount: number;
  currency: 'BSV' | 'MNEE' | 'USD';
}

interface CertificateData {
  type: string;
  issuerId: string;
  fields: Record<string, any>;
}
```

---

## Data Flow

### Lesson Booking Flow (Phase 2)

```
1. User clicks "Book Lesson" in frontend
   │
2. Frontend validates data
   │
3. BDPWallet.createLessonBooking()
   │
4. BRC-100 wallet prompts user for approval
   │
5. User approves, wallet signs transaction
   │
6. Transaction broadcast via TopicBroadcaster
   │
   ├─→ SHIP sends to tm_bdp_lessons hosts
   │
7. Topic Manager validates and admits output
   │
8. Lookup Service indexes the lesson
   │
9. STEAK returned confirming admission
   │
10. Frontend shows confirmation
    │
11. PostgreSQL also updated (hybrid storage)
```

### Query Flow

```
1. User requests lesson history
   │
2. LookupResolver.query({ service: 'ls_bdp_lessons', query: {...} })
   │
3. SLAP discovers available hosts
   │
4. Query sent to best-ranked host
   │
5. Lookup Service returns output list
   │
6. Frontend displays verified data
```

---

## Development Stack

### Required Dependencies

**Backend:**
```json
{
  "@bsv/sdk": "^1.9.9",
  "@bsv/overlay": "^0.1.0",
  "@bsv/overlay-express": "^0.1.0",
  "express": "^4.19.2",
  "pg": "^8.12.0",
  "knex": "^3.1.0",
  "mongodb": "^6.0.0"
}
```

**Frontend:**
```json
{
  "@bsv/sdk": "^1.9.9",
  "react": "^18.2.0"
}
```

**Development Tools:**
```bash
npm install -g @bsv/lars   # Local development
npm install -g @bsv/cars   # Cloud deployment
```

### deployment-info.json

```json
{
  "schema": "bsv-app",
  "schemaVersion": "1.0",
  "topicManagers": {
    "tm_bdp_lessons": "./backend/src/overlay/topic-managers/lessons.ts",
    "tm_bdp_payments": "./backend/src/overlay/topic-managers/payments.ts",
    "tm_bdp_certs": "./backend/src/overlay/topic-managers/certificates.ts"
  },
  "lookupServices": {
    "ls_bdp_lessons": {
      "serviceFactory": "./backend/src/overlay/lookup-services/lessons.ts",
      "hydrateWith": "mongo"
    },
    "ls_bdp_payments": {
      "serviceFactory": "./backend/src/overlay/lookup-services/payments.ts",
      "hydrateWith": "mongo"
    }
  },
  "frontend": {
    "language": "react",
    "sourceDirectory": "./frontend"
  },
  "configs": [
    {
      "name": "Local Development",
      "network": "testnet",
      "provider": "LARS",
      "run": ["backend", "frontend"]
    },
    {
      "name": "Production",
      "network": "mainnet",
      "provider": "CARS",
      "projectId": "bdp-production",
      "frontendHostingMethod": "HTTPS"
    }
  ]
}
```

---

## Migration Path

### Phase 1 → Phase 2 Migration

| Step | Action | Files Affected |
|------|--------|----------------|
| 1 | Install overlay dependencies | package.json |
| 2 | Create deployment-info.json | /deployment-info.json |
| 3 | Implement Topic Managers | /backend/src/overlay/topic-managers/ |
| 4 | Implement Lookup Services | /backend/src/overlay/lookup-services/ |
| 5 | Add Overlay Express server | /backend/src/overlay/server.ts |
| 6 | Update frontend with BRC-100 wallet | /frontend/src/lib/wallet.ts |
| 7 | Modify services for hybrid storage | /backend/src/services/*.ts |
| 8 | Run LARS for local testing | `npx lars` |
| 9 | Deploy to CARS for production | `npx cars deploy` |

### Hybrid Storage Strategy

During migration, maintain both PostgreSQL and overlay storage:

```typescript
// backend/src/services/lessonService.ts
async createLesson(data: CreateLessonDTO): Promise<Lesson> {
  // 1. Create in PostgreSQL (immediate, for operational use)
  const lesson = await this.repository.create(data);

  // 2. Broadcast to overlay (for verification/audit)
  if (config.OVERLAY_ENABLED) {
    const txid = await this.overlayBroadcaster.broadcastLesson(lesson);

    // 3. Update PostgreSQL with txid reference
    await this.repository.update(lesson.id, { bsvTxid: txid });
  }

  return lesson;
}
```

---

## Quick Reference

### Protocol Prefixes

| Prefix | Action | Fee (sats) |
|--------|--------|------------|
| BDP_BOOK | Lesson booking | 5 |
| BDP_PAY | Payment record | 3 |
| BDP_CERT | Certificate issuance | 10 |
| BDP_NOTIFY | Notification sent | 1 |
| BDP_PROGRESS | Progress update | 2 |
| BDP_AVAIL | Availability update | 1 |

### Key URLs

| Service | Testnet | Mainnet |
|---------|---------|---------|
| SLAP Tracker | testnet-users.bapp.dev | overlay-*.bsvb.tech |
| ARC | arc-testnet.taal.com | arc.taal.com |
| WhatsOnChain | test.whatsonchain.com | whatsonchain.com |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Jan 2026 | Complete rewrite with correct BRC standards |
| 1.0 | Nov 2025 | Initial blockchain roadmap (incorrect BRC-100 description) |

---

**This document supersedes BLOCKCHAIN_ROADMAP.md for all technical decisions.**

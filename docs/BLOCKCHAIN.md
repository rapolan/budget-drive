# Budget Drive Protocol (BDP) - Blockchain Implementation Manual

**Status:** Protocol Specification & Integration Guide
**Primary Standards:** BRC-100, BRC-52, BRC-22 (SHIP), BRC-24 (SLAP)

---

## 1. Integration Progress

### Core Protocol (Beta)
- **Infrastructure:** Overlay Express with MongoDB integration.
- **Topic Managers:** Production-ready `tm_bdp_lessons` and `tm_bdp_payments`.
- **Lookup Services:** Multi-tenant query layer for operational audit.
- **Wallet Integration:** BRC-100 compliant authentication and signing.

### Extended Functionality
- **Structured Data:** Schema.org JSON-LD profiles for global AI discoverability.
- **Active Micropayments:** Sub-satoshi fee models for agentic queries.
- **Verifiable Identity:** BRC-52 digital certificates for certified instruction.

### Automated Commerce
- **Agentic Booking:** Secure lesson booking via autonomous AI agents.
- **Network Growth:** Optimized for 10,000+ school nodes and high-frequency queries.

---

## 2. Micropayment Fee Schedule

BDP uses **fixed satoshi-level fees**, not percentage-based splits, to align with honest money principles.

| Prefix | Action | Fee (sats) | Purpose |
|--------|--------|------------|---------|
| `BDP_BOOK` | Lesson Booking | 5 | Computational cost of booking audit. |
| `BDP_PAY` | Payment Record | 3 | Financial audit trail verification. |
| `BDP_CERT` | Certificate | 10 | High-value identity/completion proof. |
| `BDP_NOTIFY`| Notification | 1 | Micro-cost for communication logs. |
| `BDP_QUERY` | AI Search | 0.5 | Passive income from market data queries. |

---

## 3. Developer Quick-Start

### Setting Up Local Development (LARS)
1.  **Install Tools:**
    ```bash
    npm install -g @bsv/lars
    npm install @bsv/sdk @bsv/overlay @bsv/overlay-express mongodb
    ```
2.  **Start Environment:**
    ```bash
    npx lars
    ```
    *LARS will launch local Docker containers for PostgreSQL and MongoDB, start your Overlay Express server, and provide an ngrok tunnel.*

### Creating a Topic Manager
```typescript
// backend/src/overlay/topic-managers/lessons.ts
export class BDPLessonTopicManager implements TopicManager {
  async identifyAdmissibleOutputs(beef: number[]): Promise<AdmittanceInstructions> {
    const tx = Transaction.fromBEEF(beef);
    // 1. Check for BDP_LESSON prefix
    // 2. Validate protocol fee (5 sats)
    // 3. Signal to admit output index to overlay
  }
}
```

---

## 4. Testing & Treasury Verification

### Treasury Action Logs
Use the following SQL to verify that Phase 1 "Virtual" satoshi fees are being tracked before Phase 2 "On-Chain" integration:

```sql
SELECT 
    bsv_action, 
    bsv_satoshis, 
    metadata->>'fee_model' as model,
    created_at 
FROM treasury_transactions 
ORDER BY created_at DESC;
```

### Verification Checklist
- [ ] Wallet connects via BRC-100
- [ ] Transaction broadcast via SHIP protocol
- [ ] Topic Manager admits output
- [ ] Lookup Service indexes hash in MongoDB
- [ ] Treasury balance reflects fee accumulation

---

## 5. Security Best Practices
- **No Private Keys in Git:** Use environment variables or HSMs.
- **PII Privacy:** Never put names, emails, or addresses on-chain. Store hashes only.
- **Rate Limiting:** Protect Lookup Services from query spam.

**For full technical specs, see [ARCHITECTURE.md](ARCHITECTURE.md).**

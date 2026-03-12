# Budget Drive Protocol (BDP) - Blockchain Implementation Manual

**Status:** Phase 2 Implementation Guide  
**Primary Standards:** BRC-100, BRC-52, BRC-22 (SHIP), BRC-24 (SLAP)

---

## 1. Implementation Roadmap

### Phase 2: Foundation (Current)
- **Infrastructure:** Set up Overlay Express with MongoDB.
- **Topic Managers:** Implement `tm_bdp_lessons` and `tm_bdp_payments` to admit transactions.
- **Lookup Services:** Create query layer for students and instructors.
- **Wallet:** Integrate BRC-100 wallet for user authentication and signing.

### Phase 2.5: AI & Micropayments (Q3 2026)
- **Structured Data:** Implement Schema.org JSON-LD profiles for instructors.
- **Query APIs:** Turn on 0.5 - 2 satoshi fees for AI queries.
- **Certificates:** Mint BRC-52 certificates for all verified instructors.

### Phase 3: Agentic Commerce (2027)
- **Payment Channels:** Infrastructure for high-volume, automated AI queries.
- **Autonomous Booking:** Enable AI agents to book lessons via signed protocol messages.
- **Revenue Scale:** Targeted 10,000 schools and $1M+ annual passive income.

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

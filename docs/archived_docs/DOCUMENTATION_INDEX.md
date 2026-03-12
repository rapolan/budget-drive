# Budget Drive Protocol - Documentation Index

**Last Updated:** January 2026
**Purpose:** Master navigation for all project documentation

---

## Quick Links

| Need to... | Read this |
|------------|-----------|
| Understand the architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Understand the vision | [BDP_VISION_AND_PHILOSOPHY.md](BDP_VISION_AND_PHILOSOPHY.md) |
| Decide what goes on-chain | [docs/DATA_SCHEMA_STRATEGY.md](docs/DATA_SCHEMA_STRATEGY.md) |
| Start development | [README.md](README.md) |
| Implement blockchain | [BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md) |
| Check database schema | [PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md) |

---

## Documentation Hierarchy

### Tier 1: Authoritative References (Always Current)

These documents are the source of truth. When in doubt, trust these.

| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [README.md](README.md) | Project overview, quick start | Jan 2026 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Technical architecture, BSV standards** | Jan 2026 |
| [docs/DATA_SCHEMA_STRATEGY.md](docs/DATA_SCHEMA_STRATEGY.md) | **Data storage decisions (PostgreSQL vs MongoDB vs Blockchain)** | Feb 2026 |
| [deployment-info.json](deployment-info.json) | LARS/CARS configuration | Jan 2026 |
| [PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md) | Database schema (PostgreSQL) | Nov 2025 |

### Tier 2: Implementation Guides

Step-by-step guides for specific features.

| Document | Purpose |
|----------|---------|
| [BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md) | BSV overlay services integration |
| [CALENDAR_MANAGEMENT_GUIDE.md](CALENDAR_MANAGEMENT_GUIDE.md) | Scheduling system |
| [NOTIFICATION_SETUP_GUIDE.md](NOTIFICATION_SETUP_GUIDE.md) | Email/SMS notifications |
| [TREASURY_TEST_GUIDE.md](TREASURY_TEST_GUIDE.md) | Testing micropayments |

### Tier 3: Philosophy & Vision

Core principles that guide all decisions.

| Document | Purpose |
|----------|---------|
| [BDP_VISION_AND_PHILOSOPHY.md](BDP_VISION_AND_PHILOSOPHY.md) | Micropayment model, no-chokepoint principles |
| [PATENT_DOCUMENTATION.md](PATENT_DOCUMENTATION.md) | Patent claims, technical disclosure |

### Tier 4: Development History

Historical records - useful for context, may be outdated.

| Document | Purpose |
|----------|---------|
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) | Session history |
| [docs/archived_phases/](docs/archived_phases/) | Completed phase docs |
| [docs/archived_sessions/](docs/archived_sessions/) | Session logs |

### Tier 5: Deprecated/Superseded

These documents contain outdated information. Kept for historical reference only.

| Document | Superseded By | Issue |
|----------|---------------|-------|
| BDP_PROJECT_MASTER.md | docs/ARCHITECTURE.md | Outdated architecture info |
| START_HERE.md | README.md | Outdated setup |
| NEXT_STEPS_BSV.md | BLOCKCHAIN_ROADMAP.md | Outdated BSV plan |
| SESSION_CURRENT.md | - | Stale session state |

---

## BSV Standards Quick Reference

**IMPORTANT:** BRC-100 is the Wallet-to-Application Interface, **NOT** a token standard.

| Standard | Name | Purpose in BDP |
|----------|------|----------------|
| **BRC-100** | Wallet Interface | Frontend wallet integration |
| **BRC-42** | Key Derivation | Cryptographic key management |
| **BRC-52** | Identity Certificates | Student/instructor credentials |
| **BRC-22** | SHIP Protocol | Transaction broadcasting |
| **BRC-24** | SLAP Protocol | Service discovery |
| **BRC-64** | Transaction Tracking | Audit trail |

### Overlay Services Components

| Component | Purpose |
|-----------|---------|
| **Topic Manager** | Decides which outputs are admitted to overlay |
| **Lookup Service** | Answers queries about overlay data |
| **SHIP** | Synchronizes Hosting for Indexing Peers |
| **SLAP** | Service Lookup Availability Protocol |
| **LARS** | Local Automated Runtime System (dev tool) |
| **CARS** | Cloud Automated Runtime System (deployment) |

For complete technical details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## File Structure

```
budget-drive-protocol/
│
├── README.md                       # Start here
├── DOCUMENTATION_INDEX.md          # This file
├── deployment-info.json            # LARS/CARS configuration
│
├── docs/
│   ├── ARCHITECTURE.md             # ⭐ Technical reference (authoritative)
│   ├── archived_phases/            # Historical phase docs
│   └── archived_sessions/          # Historical session logs
│
├── [Implementation Guides]
│   ├── BLOCKCHAIN_ROADMAP.md       # BSV overlay integration
│   ├── CALENDAR_MANAGEMENT_GUIDE.md
│   ├── NOTIFICATION_SETUP_GUIDE.md
│   ├── TREASURY_TEST_GUIDE.md
│   └── PROJECT_SCHEMA_REFERENCE.md
│
├── [Philosophy]
│   ├── BDP_VISION_AND_PHILOSOPHY.md
│   └── PATENT_DOCUMENTATION.md
│
├── [Development History]
│   ├── CHANGELOG.md
│   └── DEVELOPMENT_LOG.md
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── overlay/                # Topic Managers, Lookup Services (Phase 2)
│   └── database/
│       └── migrations/
│
└── frontend/
    └── src/
        ├── components/
        ├── pages/
        ├── api/
        └── lib/                    # BRC-100 wallet integration (Phase 2)
```

---

## When to Update What

| Change Type | Update These Documents |
|-------------|------------------------|
| Architecture change | docs/ARCHITECTURE.md, README.md |
| New feature | CHANGELOG.md, relevant guide |
| Database schema | PROJECT_SCHEMA_REFERENCE.md, migrations |
| BSV integration | BLOCKCHAIN_ROADMAP.md, docs/ARCHITECTURE.md |
| New session work | DEVELOPMENT_LOG.md |
| Version release | CHANGELOG.md, README.md |
| Deployment config | deployment-info.json |

---

## Documentation Updates (January 2026)

### New Files Created

| File | Purpose |
|------|---------|
| docs/ARCHITECTURE.md | Comprehensive technical reference with correct BSV standards |
| deployment-info.json | LARS/CARS deployment configuration |

### Files Updated

| File | Changes |
|------|---------|
| README.md | Complete rewrite - cleaner, more accurate |
| BLOCKCHAIN_ROADMAP.md | Corrected BRC-100 description (it's wallet interface, not token standard) |
| DOCUMENTATION_INDEX.md | This file - restructured with hierarchy |

### Key Corrections

1. **BRC-100 is NOT a token standard** - It's the Wallet-to-Application Interface
2. **Overlay Services architecture** documented with Topic Managers and Lookup Services
3. **SHIP/SLAP protocols** correctly explained
4. **deployment-info.json** created for LARS/CARS tooling

---

## Documentation by Use Case

### "I'm starting a new feature"

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Understand system design
2. Read [BDP_VISION_AND_PHILOSOPHY.md](BDP_VISION_AND_PHILOSOPHY.md) - Ensure alignment
3. Check [docs/DATA_SCHEMA_STRATEGY.md](docs/DATA_SCHEMA_STRATEGY.md) - Decide storage layer
4. Check [PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md) - Database context
5. Review [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) - Learn from past

### "I'm implementing blockchain features"

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technical specs
2. Read [docs/DATA_SCHEMA_STRATEGY.md](docs/DATA_SCHEMA_STRATEGY.md) - Understand data layers
3. Follow [BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md) - Implementation plan
4. Check [deployment-info.json](deployment-info.json) - LARS configuration
5. Test with `npx lars`

### "I'm onboarding to the project"

1. [README.md](README.md) - Setup environment
2. [BDP_VISION_AND_PHILOSOPHY.md](BDP_VISION_AND_PHILOSOPHY.md) - Understand principles
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Learn architecture
4. [PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md) - Study data model

### "I'm debugging an issue"

1. Check [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) - Find related history
2. Review relevant guide (Calendar, Notifications, etc.)
3. Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Verify expected behavior

---

## Search Tips

**Find specific topics:**

```bash
# Search all markdown files for keyword
grep -r "topic manager" *.md docs/

# Find files mentioning "BRC-100"
grep -l "BRC-100" *.md docs/

# Search in code
grep -r "TopicManager" backend/src/
```

**VS Code Search:**
- `Ctrl+Shift+F` (Windows) or `Cmd+Shift+F` (Mac)
- Include files: `*.md`

---

## Documentation Standards

1. **Markdown Format** - GitHub-flavored Markdown
2. **Clear Headers** - Hierarchical (##, ###, ####)
3. **Code Examples** - Practical, runnable snippets
4. **Cross-References** - Link to related docs
5. **Status Indicators** - ✅ complete, 🔄 in progress, ⏳ planned
6. **Date Stamps** - Include "Last Updated"

---

## Resources

### BSV Documentation
- [BSV SDK Documentation](https://docs.bsvblockchain.org/)
- [BRC Standards](https://bsv.brc.dev/)
- [Overlay Services](https://github.com/bsv-blockchain/overlay-services)
- [LARS](https://github.com/bitcoin-sv/lars)
- [Project Babbage](https://docs.projectbabbage.com)

### Testnet
- SLAP Tracker: testnet-users.bapp.dev
- ARC: arc-testnet.taal.com
- Explorer: test.whatsonchain.com

---

**Remember: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the authoritative technical reference.**

**Last Updated:** January 2026

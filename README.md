# Budget Drive Protocol (BDP)

A multi-tenant driving school management platform built on **BSV Blockchain** with micropayment economics.

**Version:** 1.0.0-beta  
**Status:** Beta Implementation

---

## Vision

BDP is **free forever software** for the driving instruction industry, funded by satoshi-level micropayments (1-10 sats per action). No subscriptions, no artificial limits, no rent-seeking.

**Core Principles:**
- Massive volume of microtransactions (not high-fee, low-volume)
- No chokepoints (peer-to-peer architecture)
- On-chain transparency (verifiable, auditable records)
- Horizontal scalability (unlimited growth)

---

## Features

### Core Operations
- **Multi-Tenant Architecture:** Complete data isolation for individual schools.
- **Smart Scheduling:** Proprietary 6D conflict detection engine.
- **Resource Management:** Unified tracking for students, instructors, and vehicles.
- **Lesson Lifecycle:** From booking to payment and recurring patterns.
- **External Integration:** Live ICS calendar feeds for global compatibility.
- **Developer Tools:** 60+ REST API endpoints and a React-based admin dashboard.

### Blockchain & Financials (Beta)
- **Hybrid Data Layer:** PostgreSQL for operations, BSV for immutability.
- **Micropayment Treasury:** Satoshi-level fees (e.g., 5 sats) for sustainable funding.
- **Protocol Standards:** Implementation of BRC-100, BRC-52, and BRC-24.
- **Verifiable Records:** Audit trails for payments and certifications.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **Backend** | Node.js 18 + Express + TypeScript |
| **Database** | PostgreSQL 14+ (multi-tenant) |
| **Blockchain** | BSV + @bsv/sdk + @bsv/overlay-express |
| **Development** | LARS (Local Automated Runtime System) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker (for overlay services)

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/budget-drive-protocol.git
cd budget-drive-protocol

# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
node database/run-all-migrations.js

# Frontend setup
cd ../frontend
npm install
```

### Running

```bash
# Terminal 1: Backend (port 3000)
cd backend && npm run dev

# Terminal 2: Frontend (port 5173)
cd frontend && npm run dev
```

### Enhanced Services
The protocol incorporates advanced overlay services for blockchain integration. Use the integrated toolkit to manage these services.

```bash
# Start local environment
./start-dev.ps1
```

---

## Documentation

### 🏁 Core Manifests

| Document | Description |
|----------|-------------|
| [docs/MISSION.md](docs/MISSION.md) | **Mission & Vision** - Project philosophy, strategic roadmap, and core pillars. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Technical Architecture** - Hybrid data layer, BSV standards, and system design. |
| [docs/BLOCKCHAIN.md](docs/BLOCKCHAIN.md) | **Implementation Manual** - Blockchain roadmap, fee schedules, and dev quick-start. |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | **Operational Guide** - Daily workflows, smart scheduling, and admin features. |
| [docs/BLUEPRINTS.md](docs/BLUEPRINTS.md) | **Technical Blueprints** - 6D engine, Merkle batching, and future roadmaps. |

### 📚 Archived Docs
Original fragmented documentation has been moved to [docs/archived_docs/](docs/archived_docs/) for historical reference.

---

## Project Structure

```
budget-drive-protocol/
├── backend/
│   ├── src/
│   │   ├── controllers/     # HTTP request handlers
│   │   ├── services/        # Business logic
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Auth, validation
│   │   └── overlay/         # Topic Managers, Lookup Services (Phase 2)
│   └── database/
│       └── migrations/      # PostgreSQL migrations
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── api/             # API client
│   │   └── lib/             # Wallet integration (Phase 2)
│   └── ...
├── docs/
│   └── ARCHITECTURE.md      # Technical reference
├── deployment-info.json     # LARS/CARS config
└── README.md
```

---

## BSV Standards

BDP uses the following BSV standards:

| Standard | Name | Purpose |
|----------|------|---------|
| **BRC-100** | Wallet Interface | App-to-wallet communication |
| **BRC-52** | Identity Certificates | Verifiable credentials |
| **BRC-22** | SHIP Protocol | Transaction broadcasting |
| **BRC-24** | SLAP Protocol | Service discovery |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for complete technical details.

---

## Protocol Fees

| Action | Fee (sats) | ~USD |
|--------|------------|------|
| Lesson booking | 5 | $0.0000025 |
| Payment record | 3 | $0.0000015 |
| Certificate | 10 | $0.0000050 |
| Notification | 1 | $0.0000005 |

Revenue comes from volume, not extraction. 1 million lessons = 5 million sats (~$250 at $50/BSV).

---

## Contributing

1. Read [BDP_VISION_AND_PHILOSOPHY.md](BDP_VISION_AND_PHILOSOPHY.md)
2. Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical standards
3. Follow existing code patterns
4. Submit PR with clear description

---

## License

Proprietary - All rights reserved

---

**We are building the first real Bitcoin business. Every driving instructor on the planet will use this software because it's free and the best.**

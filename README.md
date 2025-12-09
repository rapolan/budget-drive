# Budget Drive Protocol (BDP) - Driving School Management System

A comprehensive multi-tenant driving school management platform with **smart scheduling**, **universal calendar sync** (ICS feeds), **recurring lessons**, and **blockchain-verified treasury** (Craig Wright aligned).

## Current Status

**Phase:** BDP Phase 1 (Treasury + Notifications)
**Version:** 0.5.1
**Last Updated:** November 28, 2025

### ✅ Completed Features
**Phase 1-3: Core System**
- Multi-tenant architecture with complete data isolation
- Student, instructor, vehicle, and lesson management
- Payment tracking and history
- RESTful API with 60+ endpoints
- React admin dashboard

**Phase 4A: Smart Scheduling**
- 6-dimensional conflict detection (Patent Claim #1)
- **Capacity-based scheduling** - Generate exact N slots per day (not time ranges)
- Intelligent slot finding algorithm
- Auto-calculated end times (instructors set start time only)
- Configurable buffer times and lesson durations
- Vehicle ownership tracking (school vs instructor-owned)
- Availability calendar + time-off system
- 3-step booking wizard with capacity indicators

**Phase 4B: Universal Calendar Integration**
- ICS calendar feed for any calendar app (Google Calendar, Apple Calendar, Outlook, etc.)
- Email invites with ICS attachments for instant calendar updates
- Secure token-based feed URLs per instructor
- No OAuth required - works with any calendar that supports ICS subscriptions

**Phase 4C: Recurring Lessons**
- Pattern-based lesson generation (daily, weekly, biweekly, monthly)
- Bulk scheduling with conflict detection
- Series management (pause, resume, cancel)

**BDP Treasury (Nov 11, 2025):**
- Satoshi-level transaction fees (Patent Claim #2)
- Cost-based pricing: 5 sats per booking (~$0.000002 USD)
- Craig Wright philosophy alignment
- Treasury balance tracking
- BDP action logging (BDP_BOOK, BDP_PAY, etc.)

### 🔄 In Progress
**BDP Phase 1 - Week 1 (Nov 11-15):**
1. Treasury testing with lesson bookings
2. Twilio SMS notifications
3. SendGrid email notifications

**BDP Phase 1 - Week 2 (Nov 18-22):**
4. Instructor earnings reports
5. Public booking widget (embeddable)

### 📅 Upcoming
- **BDP Phase 2:** MNEE engagement rewards (Dec 2025)
- **BDP Phase 3:** BSV blockchain integration (Q1 2026)
- **BDP Phase 4:** Multi-school expansion + gig mode (Q2 2026)

## Tech Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js with TypeScript
- **Database:** PostgreSQL 14+
- **Auth:** JWT tokens

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router

## Quick Start

### Prerequisites
- Node.js 18 or higher
- PostgreSQL 14 or higher
- Git

### Installation

**1. Clone and setup database:**
\`\`\`bash
git clone https://github.com/rapolan/budget-drive.git
cd budget-drive
createdb budget_driving_school
\`\`\`

**2. Configure backend:**
\`\`\`bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
\`\`\`

**3. Run migrations:**
\`\`\`bash
node database/setup-db.js
node database/run-migration.js 001
node database/run-migration.js 002
\`\`\`

**4. Install frontend:**
\`\`\`bash
cd ../frontend
npm install
\`\`\`

### Running

**Backend** (port 3000):
\`\`\`bash
cd backend && npm run dev
\`\`\`

**Frontend** (port 5173):
\`\`\`bash
cd frontend && npm run dev
\`\`\`

## Documentation

- **[PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md)** - Comprehensive schema reference (for future sessions)
- **[DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)** - Complete project history (1000+ lines)
- **[PATENT_DOCUMENTATION.md](PATENT_DOCUMENTATION.md)** - Patent claims and technical disclosure
- **[TREASURY_TEST_GUIDE.md](TREASURY_TEST_GUIDE.md)** - Testing guide for satoshi-level fees
- **[BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md)** - BSV integration roadmap
- **[MOBILE_APP_ROADMAP.md](MOBILE_APP_ROADMAP.md)** - Instructor mobile app vision (command center)
- **[docs/SESSION_CAPACITY_SCHEDULING.md](docs/SESSION_CAPACITY_SCHEDULING.md)** - Latest session: Capacity-based scheduling
- **[docs/archived_phases/](docs/archived_phases/)** - Completed phase documentation

## Key Features

### Smart Scheduling
- **Capacity-based slot generation** - Exactly N slots per day (not time ranges)
- Intelligent slot finding with gap detection
- 6 types of conflict detection (instructor, vehicle, student, time-off, hours, buffer)
- Configurable buffer times and lesson durations
- Auto-calculated instructor end times
- Visual capacity indicators ("3 avail" badges)
- Vehicle ownership tracking

### API Highlights
- 60+ RESTful endpoints
- JWT authentication
- Multi-tenant isolation
- Input validation & sanitization

## Project Structure

See [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for complete file structure.

## License

Proprietary - All rights reserved

---

**Status:** Phase 4A Complete | Backend & Frontend Running | Ready for Calendar UI

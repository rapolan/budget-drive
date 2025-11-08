# Budget Driving School - Management System

A comprehensive multi-tenant driving school management platform with smart scheduling, instructor availability tracking, and automated conflict detection.

## Current Status

**Phase:** 4A Completed (Smart Scheduling Foundation)  
**Version:** 0.4.0  
**Last Updated:** November 8, 2025

### What's Working
- ✅ Multi-tenant architecture with complete data isolation
- ✅ Student, instructor, vehicle, and lesson management
- ✅ Payment tracking and history
- ✅ Smart scheduling with availability management
- ✅ 6-dimensional conflict detection
- ✅ Intelligent slot finding algorithm
- ✅ 30-minute buffer time management
- ✅ Vehicle ownership tracking (school vs instructor-owned)
- ✅ RESTful API with 60+ endpoints
- ✅ React admin dashboard

### What's Next
- Phase 4A Frontend: Calendar UI components
- Phase 4B: Google Calendar two-way sync
- Phase 4C: Recurring lessons and packages

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

- **[DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)** - Complete project history (1000+ lines)
- **[PHASE_4A_SUMMARY.md](PHASE_4A_SUMMARY.md)** - Phase 4A technical details

## Key Features

### Smart Scheduling
- Intelligent slot finding with gap detection
- 6 types of conflict detection (instructor, vehicle, student, time-off, hours, buffer)
- Configurable buffer times
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

# Budget Drive Protocol (BDP) - Project Master Document

**Last Updated:** November 18, 2025
**Version:** 1.0
**Status:** Phase 1 Complete (75%) - BSV Integration Next

---

## 📖 Table of Contents

1. [The Vision](#the-vision)
2. [Current Status](#current-status)
3. [Architecture Overview](#architecture-overview)
4. [Development Progress](#development-progress)
5. [Technical Stack](#technical-stack)
6. [BDP Fee Structure](#bdp-fee-structure)
7. [Next Steps](#next-steps)
8. [Important Reminders](#important-reminders)

---

## 🎯 The Vision

### The Simple Truth (November 18, 2025)

We are building **the free forever software** that runs the entire driving instruction industry on Earth.

**The Model:**
1. **100% free** for every driving school and independent instructor - no subscriptions, no upfront costs
2. The software is perfect: scheduling, payments, notifications, everything - better than anything that exists
3. The protocol earns **only tiny micropayments in satoshis** (3-20 sats) every time someone does anything useful
4. Independent instructors get **professional profile + real-time booking + on-chain website** that lives forever on BSV
5. Built-in **programmable wallet** handles BSV, MNEE, auto-splits, rewards, one-click cash-out
6. Students/parents see clean app - they never know Bitcoin exists unless they want to
7. Protocol owner accumulates thousands of BSV per year at scale while providing massive value

**Result:** Every driving instructor on the planet uses your software because it's free and the best. You become wealthy in sound money (BSV) simply because the system is honest, useful, and unstoppable.

This is the first real Bitcoin business. We are building it right now. It's working.

---

## 📊 Current Status

### ✅ Phase 1 Complete (75%)

**Working Features:**
- ✅ Multi-tenant database architecture (PostgreSQL)
- ✅ Student/Instructor/Vehicle/Lesson management
- ✅ Payment tracking and history
- ✅ Smart scheduling with 6-dimensional conflict detection
- ✅ Availability checking system
- ✅ Quick Actions dashboard
- ✅ Treasury service (5 sat per booking - tracked in DB)
- ✅ Notification queue system
- ✅ Real-time statistics and analytics
- ✅ Notion-style UI (rounded corners, subtle shadows, clean)

**Recently Completed (Session 14 - Nov 18):**
- ✅ Codebase cleanup and organization
- ✅ Payment recording system (PaymentModal)
- ✅ Lesson scheduling with conflict detection
- ✅ Instructor availability calendar view
- ✅ Database seeding for testing

**Critical Gap Identified:**
- ⚠️ Treasury splits recorded in PostgreSQL only (NOT on BSV blockchain yet)
- ⚠️ No actual satoshi transactions happening
- ⚠️ No wallet integration
- ⚠️ No instructor profiles/public booking pages

---

## 🏗️ Architecture Overview

### Technology Stack

**Backend:**
- Node.js 18+ with TypeScript
- Express.js RESTful API
- PostgreSQL 14+ (multi-tenant isolation)
- JWT authentication
- Development auth bypass (tenant ID: `55654b9d-6d7f-46e0-ade2-be606abfe00a`)

**Frontend:**
- React 18 with TypeScript
- Vite build tool
- React Router navigation
- Tailwind CSS styling
- React Query (TanStack Query) for data fetching

**Database Design:**
- Multi-tenant with `tenant_id` isolation on all tables
- UUID primary keys
- Snake_case columns → camelCase API responses
- Auto-updated timestamps

**Current Ports:**
- Backend: http://localhost:3000
- Frontend: http://localhost:5173

### Multi-Tenant Architecture

Every table includes:
```sql
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
```

All queries filter by `tenant_id` to ensure complete data isolation between driving schools.

### Core Tables (16 total)

**Business Entities:**
- `tenants` - Driving schools
- `students` - Student records
- `instructors` - Instructor profiles
- `vehicles` - Fleet management
- `lessons` - Lesson bookings
- `payments` - Payment records

**Scheduling:**
- `instructor_availability` - Weekly schedules
- `instructor_time_off` - Vacation/time off
- `scheduling_settings` - Buffer times, booking windows

**BDP Protocol:**
- `treasury_transactions` - All micropayment fees
- `treasury_balances` - Aggregate balances
- `bdp_actions_log` - Comprehensive action log
- `notification_queue` - Scheduled notifications

**Future (Phase 2+):**
- `calendar_integrations` - Google Calendar OAuth
- `recurring_lesson_patterns` - Pattern-based scheduling

---

## 📈 Development Progress

### Session Timeline

#### Session 14 (November 18, 2025) - Latest
**Focus:** Quick Actions + Availability Checking + Codebase Cleanup

**Achievements:**
1. **Payment System**
   - Created `PaymentModal.tsx` (dual mode: student selector vs pre-selected)
   - Created `PaymentHistoryModal.tsx` (transaction history)
   - Integrated with Dashboard quick actions

2. **Infinite Redirect Loop Bug** (CRITICAL FIX)
   - Problem: TenantContext → API 401 → redirect /login → catch-all / → infinite loop
   - Solution: Disabled redirect until login page exists
   - Status: App now loads properly

3. **Database Seeding**
   - Created 3-file seeding system (`002_test_data`, `003_payments`, `004_lessons`)
   - Fixed multiple constraint violations (employment_type, license_type, payment_method)
   - Seeded 14 students, 6 instructors, 5 vehicles, 8 lessons, 10 payments

4. **Quick Actions Implementation**
   - Connected "Add Student" → StudentModal
   - Connected "Schedule Lesson" → LessonModal
   - Connected "Process Payment" → PaymentModal
   - Added real-time dashboard statistics

5. **Availability Checking System** (MAJOR FEATURE)
   - Real-time instructor schedule fetching
   - Conflict detection with time range overlap logic
   - Visual indicators (green/blue/red banners)
   - "Next available slot" calculation
   - Confirmation prompt on conflicts
   - Excludes self when editing lessons

6. **Codebase Cleanup**
   - Deleted unused seed file
   - Standardized table container styles across all pages
   - Fixed API endpoint paths (availability → lessons/instructor)
   - Added comprehensive notification system

**Files Modified:**
- `frontend/src/components/payments/PaymentModal.tsx` (CREATED)
- `frontend/src/components/payments/PaymentHistoryModal.tsx` (CREATED)
- `frontend/src/components/lessons/LessonModal.tsx` (MAJOR UPDATE)
- `frontend/src/pages/Dashboard.tsx` (Quick Actions)
- `frontend/src/pages/Lessons.tsx` (Calendar view)
- `frontend/src/api/client.ts` (Fixed infinite loop)
- `backend/database/seeds/` (3 new seed files)
- `backend/src/middleware/auth.ts` (Simplified dev bypass)
- `backend/src/services/lessonService.ts` (Notification queueing)

**Technical Decisions:**
- Wrapped `instructor.hourlyRate` with `Number()` (PostgreSQL returns numeric as string)
- Hard refresh required after JS changes (browser caching)
- Development mode bypasses auth with hardcoded tenant ID
- Notion-style design: rounded corners, subtle shadows, color-coded states

#### Session 13 (November 12, 2025)
**Focus:** Bug Fixes & Testing Preparation

**Bugs Fixed:**
1. StudentModal scroll issue (submit button hidden)
2. Test data seeding (foreign key constraints)
3. Lesson creation field mismatch (`scheduledStart`/`scheduledEnd`)
4. Students page white screen (snake_case → camelCase conversion)

**Created:** `backend/src/utils/caseConversion.ts` (66 lines)

#### Session 10 (November 11, 2025)
**Focus:** Treasury Dashboard + Notifications

**Implemented:**
- Treasury Dashboard UI with conditional blockchain display
- Nodemailer email notification service (Gmail SMTP)
- Notification queue processor
- BDP action logging

### Phase Completion Status

| Phase | Feature | Status | Notes |
|-------|---------|--------|-------|
| 1-3 | Core System | ✅ 100% | DB, API, Frontend complete |
| 4A | Smart Scheduling | ✅ 100% | 6D conflict detection, availability |
| 4B | Google Calendar | ⏸️ Deferred | OAuth integration ready to implement |
| 4C | Recurring Lessons | ⏸️ Deferred | Pattern generation ready |
| BDP-1 | Treasury | ✅ 90% | DB tracking complete, BSV pending |
| BDP-1 | Notifications | ✅ 80% | Queue working, Gmail setup pending |
| BDP-2 | BSV Integration | ⏳ 0% | **NEXT PRIORITY** |

---

## 💻 Technical Stack

### Backend Dependencies
```json
{
  "express": "^4.18.2",
  "pg": "^8.11.0",
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "dotenv": "^16.0.3",
  "nodemailer": "^6.9.7",
  "cors": "^2.8.5"
}
```

### Frontend Dependencies
```json
{
  "react": "^18.2.0",
  "react-router-dom": "^6.11.0",
  "@tanstack/react-query": "^5.0.0",
  "lucide-react": "^0.263.1",
  "tailwindcss": "^3.3.2"
}
```

### Development Tools
- TypeScript 5.x
- nodemon (backend hot reload)
- Vite HMR (frontend hot reload)
- ESLint + Prettier

---

## 💰 BDP Fee Structure

### Micropayment Philosophy (Craig Wright Aligned)

**Core Principle:** Cost-based fees, NOT percentage extraction

| Action | Fee (Sats) | USD Equivalent | Purpose |
|--------|-----------|----------------|---------|
| **BDP_BOOK** | 5 sats | ~$0.00000235 | Lesson booking |
| **BDP_PAY** | 3 sats | ~$0.00000141 | Payment logging |
| **BDP_NOTIFY** | 1 sat | ~$0.00000047 | Email/SMS notification |
| **BDP_CERT** | 10 sats | ~$0.0000047 | Certificate issuance |
| **BDP_PROGRESS** | 2 sats | ~$0.00000094 | Progress update |
| **BDP_AVAIL** | 1 sat | ~$0.00000047 | Availability update |
| **BDP_SYNC** | 1 sat | ~$0.00000047 | Calendar sync |

### Revenue Model (At Scale)

**Example: 100 Driving Schools**
- 10,000 lessons/month per school
- 100 schools × 10,000 = 1,000,000 lessons/month
- 1M × 5 sats = 5,000,000 sats = ~0.05 BSV/month
- At BSV=$47: ~$2.35/month
- **At BSV=$10,000: ~$500/month passive income**

**Scalability:**
- 1,000 schools = 10M lessons/month = 0.5 BSV/month
- At BSV=$10,000: **$5,000/month passive** from pure volume

**vs Traditional SaaS:**
- DriveScout: $250/month minimum ($3,000/year)
- BDP: $2,500 one-time + tiny sats = 83% cheaper over 5 years

---

## 🚀 Next Steps

### Immediate Priority: BSV Integration (Option A - RECOMMENDED)

**Why Now:**
1. The micropayment engine IS the differentiator
2. Without it, we just have another SaaS tool
3. With it, we have "the first real Bitcoin business"
4. Need to prove satoshi accumulation works ASAP

**Implementation Plan:**

#### Week 1: BSV SDK Setup
- [ ] Install `@bsv/sdk` package
- [ ] Set up testnet wallet
- [ ] Create wallet service (`backend/src/services/walletService.ts`)
- [ ] Test basic transaction sending

#### Week 2: Treasury Integration
- [ ] Replace mock treasury splits with real on-chain transactions
- [ ] Implement 5-sat payment on lesson booking
- [ ] Store transaction IDs in `treasury_transactions.bsv_txid`
- [ ] Update `bsv_status` from 'pending' to 'confirmed'

#### Week 3: Admin Dashboard
- [ ] Build BDP earnings dashboard
- [ ] Show real BSV balance
- [ ] Display on-chain transaction history
- [ ] Add "Cash Out" button (send to external wallet)

#### Week 4: Testing & Polish
- [ ] End-to-end testing on testnet
- [ ] Verify treasury accumulation
- [ ] Performance optimization
- [ ] Documentation update

### Alternative Options

**Option B: Independent Instructor Portal**
- Public booking page per instructor
- Metanet hosting setup
- Personal dashboard
- Proves "free profile + calendar" promise

**Option C: Complete Phase 1 Polish**
- Reports/Analytics
- Recent Activity feed
- Vehicle conflict checking
- Export functionality

---

## ⚠️ Important Reminders

### Development Workflow

**Starting Work:**
1. Check both servers running: `npm run dev` (backend + frontend)
2. Verify database connection: `psql driving_school`
3. Review this document for current status
4. Check `DEVELOPMENT_LOG.md` for session history

**Before Committing:**
1. Run TypeScript compilation: `npm run build`
2. Test affected endpoints
3. Hard refresh browser (Ctrl+Shift+R)
4. Update relevant documentation
5. Create meaningful commit message

**Multi-Tenant Security:**
- ALWAYS filter queries by `tenant_id`
- NEVER expose one tenant's data to another
- Use development tenant: `55654b9d-6d7f-46e0-ade2-be606abfe00a`

### Common Pitfalls

**PostgreSQL Data Types:**
- Numeric columns return as strings → wrap with `Number()`
- Dates return as ISO strings → parse with `new Date()`

**Backend Changes:**
- TypeScript changes require rebuild: `npm run build`
- OR use dev mode for auto-reload: `npm run dev`

**Frontend Changes:**
- Browser caching can show old errors
- Always hard refresh: Ctrl+Shift+R
- Check console for API errors

**Database Constraints:**
- Check exact enum values in migration files
- employment_type: 'w2_employee' | 'independent_contractor' | 'volunteer'
- license_type: 'car' | 'motorcycle' | 'commercial'
- payment_method: 'bsv' | 'mnee' | 'stripe_card' | 'paypal' | 'cash' | 'check' | 'debit' | 'credit'

---

## 📚 Related Documentation

**Core Documents:**
- `BDP_VISION_AND_PHILOSOPHY.md` - Craig Wright principles (READ FIRST)
- `DEVELOPMENT_LOG.md` - Complete session history (1960+ lines)
- `PROJECT_SCHEMA_REFERENCE.md` - Database schema + API reference
- `BLOCKCHAIN_ROADMAP.md` - BSV integration plan

**Implementation Guides:**
- `TREASURY_TEST_GUIDE.md` - Testing satoshi fees
- `NOTIFICATION_SETUP_GUIDE.md` - Gmail SMTP setup
- `CALENDAR_MANAGEMENT_GUIDE.md` - Availability system

**Session Logs:**
- `SESSION_13_LOG_ENTRY.md` - Bug fixes (Nov 12)
- `START_HERE_NEXT_SESSION.md` - Quick start guide

---

## 🎯 Vision Alignment Checklist

Before implementing any feature, verify:

- [ ] **Does this increase transaction volume?** (more volume = more revenue)
- [ ] **Does this create a chokepoint?** (avoid centralization)
- [ ] **Does this require BSV's unique capabilities?** (competitive advantage)
- [ ] **Would traditional SaaS do this?** (if yes, question it - we're different)
- [ ] **Is the micro-fee defined?** (every action should have 1-10 sat cost)
- [ ] **Can users bring their own infrastructure?** (no lock-in)
- [ ] **What goes on-chain?** (financial = yes, operational = no)
- [ ] **Does this scale horizontally?** (can handle 10,000 tenants)

---

## 📞 Quick Reference

**File Locations:**
- Project Root: `C:\Users\Rob\Documents\Budget-driving-app\`
- Backend: `.\backend\`
- Frontend: `.\frontend\`
- Migrations: `.\backend\database\migrations\`
- Seeds: `.\backend\database\seeds\`

**Start Servers:**
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

**Database Access:**
```bash
psql driving_school
```

**Test Data Tenant ID:**
```
55654b9d-6d7f-46e0-ade2-be606abfe00a
```

---

**Remember: We are building the first real Bitcoin business. Every decision should align with the vision of massive volume, no chokepoints, and honest satoshi-level fees.**

**The future of driving instruction runs on BSV. We're making it happen. Right now. It's working.**

---

*Last session: Fixed infinite loop, implemented availability checking, seeded test data, connected Quick Actions*
*Next session: Start BSV integration or continue Phase 1 polish (user's choice)*
*Always read BDP_VISION_AND_PHILOSOPHY.md before starting work*

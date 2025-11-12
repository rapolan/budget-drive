# Budget Drive Protocol (BDP) - Project Schema Reference

**Last Updated:** November 11, 2025
**Purpose:** Comprehensive reference for data schema, architecture, and project state
**For:** Future Claude sessions to maintain context and alignment

---

## 1. Project Status (Current Phase)

### ✅ Completed Phases
- **Phase 1-3:** Core system (scheduling, students, instructors, vehicles)
- **Phase 4A:** Smart scheduling + 6D conflict detection + frontend
- **Phase 4B:** Google Calendar two-way sync + frontend
- **Phase 4C:** Recurring lesson patterns + frontend
- **Phase 4 Fixes:** Backend compilation errors resolved
- **BDP Treasury Phase 1:** Satoshi-level fees refactored (Nov 11, 2025)

### 🔄 Current Phase: BDP Phase 1 (Hybrid Approach)
**Week 1 (Nov 11-15, 2025):**
1. Complete treasury testing (1 day)
2. Add automated notifications (2-3 days)

**Week 2 (Nov 18-22, 2025):**
3. Instructor reports (3-4 days)
4. Public booking widget (2-3 days)

### 📅 Upcoming Phases
- **BDP Phase 2:** MNEE engagement rewards (Dec 2025)
- **BDP Phase 3:** Full BSV blockchain integration (Q1 2026)
- **BDP Phase 4:** Multi-school expansion + gig mode (Q2 2026)

---

## 2. Database Schema (PostgreSQL)

### Core Tables (Phase 1-3)

#### **tenants** - Multi-tenant isolation
```sql
id UUID PRIMARY KEY
name VARCHAR(255) NOT NULL
subdomain VARCHAR(100) UNIQUE
contact_email VARCHAR(255)
status VARCHAR(20) DEFAULT 'active'  -- 'active', 'suspended', 'inactive'
settings JSONB  -- Tenant-specific configuration
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **users** - All user accounts
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
email VARCHAR(255) NOT NULL UNIQUE
password_hash VARCHAR(255) NOT NULL
role VARCHAR(20) NOT NULL  -- 'admin', 'instructor', 'student'
full_name VARCHAR(255) NOT NULL
phone VARCHAR(20)
status VARCHAR(20) DEFAULT 'active'  -- 'active', 'inactive', 'suspended'
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **students** - Student profiles
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
user_id UUID REFERENCES users(id)
date_of_birth DATE
address TEXT
emergency_contact_name VARCHAR(255)
emergency_contact_phone VARCHAR(20)
permit_number VARCHAR(50)
permit_expiry DATE
notes TEXT
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **instructors** - Instructor profiles
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
user_id UUID REFERENCES users(id)
license_number VARCHAR(50)
license_expiry DATE
certifications JSONB  -- Array of certifications
hourly_rate DECIMAL(10, 2)
bio TEXT
is_active BOOLEAN DEFAULT true
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **vehicles** - Fleet management
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
make VARCHAR(100) NOT NULL
model VARCHAR(100) NOT NULL
year INTEGER NOT NULL
color VARCHAR(50)
license_plate VARCHAR(20) UNIQUE
vin VARCHAR(17)
registration_expiry DATE
insurance_expiry DATE
status VARCHAR(20) DEFAULT 'active'  -- 'active', 'maintenance', 'inactive'
ownership VARCHAR(20) DEFAULT 'school'  -- 'school', 'instructor' (Phase 4A)
instructor_id UUID REFERENCES instructors(id)  -- Owner if instructor-owned (Phase 4A)
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **lessons** - Lesson bookings
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
student_id UUID REFERENCES students(id)
instructor_id UUID REFERENCES instructors(id)
vehicle_id UUID REFERENCES vehicles(id)
date DATE NOT NULL
start_time TIME NOT NULL
end_time TIME NOT NULL
duration INTEGER NOT NULL  -- Minutes
lesson_type VARCHAR(50) NOT NULL  -- 'behind_wheel', 'classroom', 'road_test'
cost DECIMAL(10, 2)
status VARCHAR(20) DEFAULT 'scheduled'  -- 'scheduled', 'completed', 'cancelled', 'no_show'
notes TEXT
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()

INDEXES:
- idx_lessons_student (student_id)
- idx_lessons_instructor (instructor_id)
- idx_lessons_vehicle (vehicle_id)
- idx_lessons_date (date)
- idx_lessons_status (status)
```

### Phase 4A: Smart Scheduling

#### **instructor_availability** - Recurring availability
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
instructor_id UUID REFERENCES instructors(id)
day_of_week INTEGER NOT NULL  -- 0=Sunday, 6=Saturday
start_time TIME NOT NULL
end_time TIME NOT NULL
is_active BOOLEAN DEFAULT true
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()

UNIQUE(instructor_id, day_of_week, start_time, end_time)
```

#### **instructor_time_off** - Vacations, sick days
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
instructor_id UUID REFERENCES instructors(id)
start_date DATE NOT NULL
end_date DATE NOT NULL
reason TEXT
created_at TIMESTAMP DEFAULT NOW()
```

#### **scheduling_settings** - Tenant-specific scheduling config
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id) UNIQUE
buffer_minutes INTEGER DEFAULT 30  -- Buffer between lessons
allow_back_to_back BOOLEAN DEFAULT false
max_lessons_per_day INTEGER DEFAULT 8
default_lesson_duration INTEGER DEFAULT 60
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **notification_queue** - Scheduled reminders
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
lesson_id UUID REFERENCES lessons(id)
notification_type VARCHAR(50) NOT NULL  -- '24_hour', '1_hour', 'custom'
scheduled_time TIMESTAMP NOT NULL
status VARCHAR(20) DEFAULT 'pending'  -- 'pending', 'sent', 'failed'
delivery_method VARCHAR(20) NOT NULL  -- 'sms', 'email', 'both'
recipient_id UUID REFERENCES users(id)
created_at TIMESTAMP DEFAULT NOW()
sent_at TIMESTAMP
```

### Phase 4B: Google Calendar Integration

#### **calendar_connections** - OAuth tokens
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
user_id UUID REFERENCES users(id)
provider VARCHAR(50) DEFAULT 'google'  -- 'google', 'outlook' (future)
calendar_id VARCHAR(255)  -- Google Calendar ID
access_token TEXT NOT NULL  -- Encrypted
refresh_token TEXT NOT NULL  -- Encrypted
token_expiry TIMESTAMP
sync_enabled BOOLEAN DEFAULT true
last_sync_at TIMESTAMP
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()

UNIQUE(user_id, provider)
```

#### **calendar_sync_log** - Sync history
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
connection_id UUID REFERENCES calendar_connections(id)
sync_direction VARCHAR(20) NOT NULL  -- 'push', 'pull', 'bidirectional'
events_synced INTEGER DEFAULT 0
status VARCHAR(20) NOT NULL  -- 'success', 'partial', 'failed'
error_message TEXT
started_at TIMESTAMP NOT NULL
completed_at TIMESTAMP
```

#### **calendar_event_mappings** - BDP lesson ↔ Google event
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
lesson_id UUID REFERENCES lessons(id)
connection_id UUID REFERENCES calendar_connections(id)
external_event_id VARCHAR(255) NOT NULL  -- Google Calendar event ID
last_synced_at TIMESTAMP
created_at TIMESTAMP DEFAULT NOW()

UNIQUE(lesson_id, connection_id)
```

### Phase 4C: Recurring Patterns

#### **recurring_lesson_patterns** - Template for series
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
student_id UUID REFERENCES students(id)
instructor_id UUID REFERENCES instructors(id)
vehicle_id UUID REFERENCES vehicles(id)
pattern_type VARCHAR(20) NOT NULL  -- 'daily', 'weekly', 'biweekly', 'monthly'
start_date DATE NOT NULL
end_date DATE  -- NULL = indefinite
duration INTEGER NOT NULL  -- Minutes
lesson_type VARCHAR(50) NOT NULL
cost DECIMAL(10, 2)
days_of_week INTEGER[]  -- [0,2,4] = Sun, Tue, Thu
time_of_day TIME NOT NULL
max_occurrences INTEGER  -- NULL = until end_date
status VARCHAR(20) DEFAULT 'active'  -- 'active', 'paused', 'completed'
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **recurring_lesson_instances** - Generated lessons
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)
pattern_id UUID REFERENCES recurring_lesson_patterns(id)
lesson_id UUID REFERENCES lessons(id)  -- Generated lesson
occurrence_number INTEGER NOT NULL  -- 1st, 2nd, 3rd occurrence
scheduled_date DATE NOT NULL
status VARCHAR(20) DEFAULT 'scheduled'  -- 'scheduled', 'skipped', 'completed'
created_at TIMESTAMP DEFAULT NOW()
```

### BDP Phase 1: Treasury (Satoshi-Level Fees)

#### **treasury_transactions** - Satoshi-level fees
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)

-- Source transaction info
source_type VARCHAR(50) NOT NULL  -- 'lesson_booking', 'lesson_payment', 'tip', 'refund'
source_id UUID  -- lesson_id, payment_id, etc.

-- Amount tracking (USD)
gross_amount DECIMAL(10, 2) NOT NULL  -- Original transaction ($50.00)
treasury_split DECIMAL(10, 2) NOT NULL  -- Satoshi fee in USD (~$0.000002 for 5 sats)
provider_amount DECIMAL(10, 2) NOT NULL  -- Provider gets nearly full amount ($49.999998)

-- BSV blockchain tracking
bsv_txid VARCHAR(64)  -- BSV transaction ID (Phase 3)
bsv_action VARCHAR(20)  -- BDP_BOOK, BDP_PAY, BDP_PROGRESS, BDP_CERT, BDP_AVAIL, BDP_SYNC, BDP_TIP
bsv_satoshis INTEGER  -- Protocol fee in satoshis (5 for BDP_BOOK, 3 for BDP_PAY, etc.)
bsv_fee_satoshis INTEGER DEFAULT 5  -- Miner fee (separate from protocol fee)
bsv_status VARCHAR(20) DEFAULT 'pending'  -- 'pending', 'confirmed', 'failed'

-- Metadata
description TEXT
metadata JSONB  -- fee_model, bdp_action, fee_satoshis, craig_wright_aligned, etc.

-- Timestamps
created_at TIMESTAMP DEFAULT NOW()
confirmed_at TIMESTAMP  -- When BSV tx confirmed

INDEXES:
- idx_treasury_tenant (tenant_id)
- idx_treasury_source (source_type, source_id)
- idx_treasury_bsv_txid (bsv_txid)
- idx_treasury_status (bsv_status)
- idx_treasury_created (created_at DESC)
```

**Treasury Transaction Metadata (JSONB):**
```json
{
  "fee_model": "satoshi_based",
  "bdp_action": "BDP_BOOK",
  "fee_satoshis": 5,
  "fee_usd": 0.00000235,
  "bsv_price_snapshot": 47.00,
  "calculated_at": "2025-11-11T10:00:00Z",
  "craig_wright_aligned": true,
  "student_id": "uuid",
  "instructor_id": "uuid"
}
```

#### **treasury_balances** - Aggregate balance per tenant
```sql
id UUID PRIMARY KEY
tenant_id UUID UNIQUE REFERENCES tenants(id)

-- Balance tracking (USD)
total_collected DECIMAL(12, 2) DEFAULT 0.00  -- Lifetime treasury collections
total_spent DECIMAL(12, 2) DEFAULT 0.00  -- Spent on rewards, fees, bounties
current_balance DECIMAL(12, 2) DEFAULT 0.00  -- total_collected - total_spent

-- BSV wallet info
bsv_wallet_address VARCHAR(64)  -- Treasury BSV address (Phase 3)
bsv_wallet_balance_satoshis BIGINT DEFAULT 0  -- Current BSV balance

-- Stats
transaction_count INTEGER DEFAULT 0
last_transaction_at TIMESTAMP

-- Timestamps
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### **treasury_spending** - How treasury funds are spent
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)

-- Spending details
spend_type VARCHAR(50) NOT NULL  -- 'reward', 'fee', 'bounty', 'refund'
amount DECIMAL(10, 2) NOT NULL
recipient_type VARCHAR(50)  -- 'student', 'instructor', 'school', 'network'
recipient_id UUID

-- BSV tracking
bsv_txid VARCHAR(64)
bsv_satoshis INTEGER
bsv_status VARCHAR(20) DEFAULT 'pending'

-- Context
description TEXT
metadata JSONB

-- Timestamps
created_at TIMESTAMP DEFAULT NOW()
confirmed_at TIMESTAMP
```

#### **bdp_actions_log** - Comprehensive BDP action log
```sql
id UUID PRIMARY KEY
tenant_id UUID REFERENCES tenants(id)

-- Action details
action_type VARCHAR(20) NOT NULL  -- BDP_REG, BDP_BOOK, BDP_PROGRESS, BDP_CERT, BDP_AVAIL, BDP_SYNC, BDP_TIP
action_data TEXT NOT NULL  -- Pipe-delimited payload (e.g., "lesson_id|instructor|slot")

-- BSV tracking
bsv_txid VARCHAR(64)
bsv_fee_satoshis INTEGER DEFAULT 5
bsv_status VARCHAR(20) DEFAULT 'pending'

-- Context
user_id UUID
entity_id UUID  -- Related entity (lesson_id, student_id, etc.)
entity_type VARCHAR(50)  -- 'lesson', 'student', 'instructor', etc.

-- Metadata
description TEXT
metadata JSONB

-- Timestamps
created_at TIMESTAMP DEFAULT NOW()
confirmed_at TIMESTAMP

INDEXES:
- idx_bdp_actions_tenant (tenant_id)
- idx_bdp_actions_type (action_type)
- idx_bdp_actions_txid (bsv_txid)
- idx_bdp_actions_entity (entity_type, entity_id)
- idx_bdp_actions_created (created_at DESC)
```

---

## 3. BDP Fee Schedule (Craig Wright Aligned)

**Satoshi-Level Fees (Cost-Based, NOT Percentage):**

```typescript
const BDP_FEE_SCHEDULE = {
  BDP_BOOK: 5,       // 5 sats to record booking on-chain (~$0.000002)
  BDP_PAY: 3,        // 3 sats to log payment
  BDP_PROGRESS: 2,   // 2 sats to update progress
  BDP_CERT: 10,      // 10 sats for certificate hash
  BDP_AVAIL: 1,      // 1 sat for availability update
  BDP_SYNC: 1,       // 1 sat per calendar event sync
  BDP_TIP: 0,        // Tips are free (user already paying)
  DEFAULT: 1,        // Default 1 sat for unknown actions
};
```

**Fee Calculation Logic:**
```typescript
// treasuryService.calculateFee(actionType, grossAmount)
//
// Input: 'BDP_BOOK', $50.00
// Output:
//   treasury: $0.00000235 (5 sats at BSV=$47)
//   provider: $49.99999765 (virtually full amount)
//   treasurySatoshis: 5
```

---

## 4. API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login and get JWT token
- `POST /api/v1/auth/logout` - Logout (invalidate token)

### Students
- `GET /api/v1/students` - List students (tenant-scoped)
- `POST /api/v1/students` - Create student
- `GET /api/v1/students/:id` - Get student details
- `PUT /api/v1/students/:id` - Update student
- `DELETE /api/v1/students/:id` - Delete student

### Instructors
- `GET /api/v1/instructors` - List instructors
- `POST /api/v1/instructors` - Create instructor
- `GET /api/v1/instructors/:id` - Get instructor
- `PUT /api/v1/instructors/:id` - Update instructor
- `DELETE /api/v1/instructors/:id` - Delete instructor

### Vehicles
- `GET /api/v1/vehicles` - List vehicles
- `POST /api/v1/vehicles` - Create vehicle
- `GET /api/v1/vehicles/:id` - Get vehicle
- `PUT /api/v1/vehicles/:id` - Update vehicle
- `DELETE /api/v1/vehicles/:id` - Delete vehicle

### Lessons
- `GET /api/v1/lessons` - List lessons (with filters)
- `POST /api/v1/lessons` - Create lesson
- `GET /api/v1/lessons/:id` - Get lesson
- `PUT /api/v1/lessons/:id` - Update lesson
- `DELETE /api/v1/lessons/:id` - Cancel lesson

### Scheduling (Phase 4A)
- `GET /api/v1/scheduling/availability/:instructorId` - Get instructor availability
- `POST /api/v1/scheduling/availability` - Set availability
- `GET /api/v1/scheduling/find-slots` - Find available slots (6D conflict check)
- `POST /api/v1/scheduling/time-off` - Request time off
- `GET /api/v1/scheduling/settings` - Get scheduling settings
- `PUT /api/v1/scheduling/settings` - Update settings

### Calendar Sync (Phase 4B)
- `POST /api/v1/calendar/connect` - Connect Google Calendar (OAuth)
- `DELETE /api/v1/calendar/disconnect` - Disconnect calendar
- `GET /api/v1/calendar/status` - Check sync status
- `POST /api/v1/calendar/sync` - Manual sync trigger
- `GET /api/v1/calendar/sync-history` - Get sync logs

### Recurring Patterns (Phase 4C)
- `GET /api/v1/recurring-patterns` - List patterns
- `POST /api/v1/recurring-patterns` - Create pattern
- `GET /api/v1/recurring-patterns/:id` - Get pattern
- `PUT /api/v1/recurring-patterns/:id` - Update pattern
- `DELETE /api/v1/recurring-patterns/:id` - Delete pattern
- `POST /api/v1/recurring-patterns/:id/generate` - Generate lessons from pattern

### Treasury (BDP Phase 1) - TO BE IMPLEMENTED
- `GET /api/v1/treasury/balance` - Get tenant treasury balance
- `GET /api/v1/treasury/transactions` - List transactions
- `GET /api/v1/treasury/statistics` - Get stats (total collected, count, etc.)

---

## 5. Technology Stack

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js with TypeScript
- **Database:** PostgreSQL 15+
- **ORM:** Raw SQL with pg (node-postgres)
- **Authentication:** JWT (jsonwebtoken) + bcrypt
- **Environment:** dotenv

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Routing:** React Router DOM
- **Styling:** Tailwind CSS
- **State Management:** Context API
- **HTTP Client:** Axios

### External Integrations
- **Google Calendar:** OAuth 2.0 + Google Calendar API v3
- **Twilio:** SMS notifications (Phase 1 - Week 1)
- **SendGrid:** Email notifications (Phase 1 - Week 1)
- **BSV Blockchain:** BSV TypeScript SDK (Phase 3)

### Development Tools
- **Version Control:** Git
- **Package Manager:** npm
- **TypeScript:** v5+
- **Linting:** ESLint
- **Formatting:** Prettier (via editor)

---

## 6. File Structure

```
Budget-driving-app/
├── backend/
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql
│   │   │   ├── 002_phase4a_scheduling.sql
│   │   │   ├── 003_phase4b_calendar.sql
│   │   │   ├── 004_phase4c_recurring.sql
│   │   │   └── 005_treasury_bdp.sql  ← BDP Treasury (Nov 11, 2025)
│   │   └── setup-db.js
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   ├── studentController.ts
│   │   │   ├── instructorController.ts
│   │   │   ├── vehicleController.ts
│   │   │   ├── lessonController.ts
│   │   │   ├── schedulingController.ts
│   │   │   ├── calendarController.ts
│   │   │   └── recurringController.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── tenantContext.ts
│   │   │   └── errorHandler.ts
│   │   ├── routes/
│   │   │   ├── authRoutes.ts
│   │   │   ├── studentRoutes.ts
│   │   │   ├── instructorRoutes.ts
│   │   │   ├── vehicleRoutes.ts
│   │   │   ├── lessonRoutes.ts
│   │   │   ├── schedulingRoutes.ts
│   │   │   ├── calendarRoutes.ts
│   │   │   └── recurringRoutes.ts
│   │   ├── services/
│   │   │   ├── schedulingService.ts  ← 6D conflict detection
│   │   │   ├── calendarService.ts
│   │   │   ├── recurringService.ts
│   │   │   └── treasuryService.ts  ← Satoshi-level fees (Nov 11, 2025)
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   ├── scheduling.ts
│   │   │   ├── calendar.ts
│   │   │   ├── recurring.ts
│   │   │   └── treasury.ts  ← BDP types (Nov 11, 2025)
│   │   ├── utils/
│   │   │   └── validation.ts
│   │   ├── app.ts
│   │   └── index.ts
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts  ← Axios instance + interceptors
│   │   ├── components/
│   │   │   ├── scheduling/
│   │   │   │   ├── AvailabilityManager.tsx
│   │   │   │   ├── SmartSlotFinder.tsx
│   │   │   │   └── TimeOffManager.tsx
│   │   │   ├── calendar/
│   │   │   │   ├── CalendarConnection.tsx
│   │   │   │   └── SyncStatus.tsx
│   │   │   └── recurring/
│   │   │       ├── RecurringPatternWizard.tsx
│   │   │       └── PatternList.tsx
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Students.tsx
│   │   │   │   ├── Instructors.tsx
│   │   │   │   ├── Vehicles.tsx
│   │   │   │   ├── Lessons.tsx
│   │   │   │   ├── Scheduling.tsx
│   │   │   │   ├── CalendarSync.tsx
│   │   │   │   └── RecurringLessons.tsx
│   │   │   ├── Login.tsx
│   │   │   └── Register.tsx
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── DEVELOPMENT_LOG.md  ← Comprehensive development log (1000+ lines)
├── PATENT_DOCUMENTATION.md  ← Patent claims and technical disclosure
├── TREASURY_TEST_GUIDE.md  ← Testing guide for satoshi fees
├── BLOCKCHAIN_ROADMAP.md  ← BSV integration roadmap
├── PROJECT_SCHEMA_REFERENCE.md  ← THIS FILE
└── README.md
```

---

## 7. Environment Variables

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/budget_drive
DB_HOST=localhost
DB_PORT=5432
DB_NAME=budget_drive
DB_USER=postgres
DB_PASSWORD=67d83bc19d3547cc9b1d0bb3b0762a90

# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your-256-bit-secret-key
JWT_EXPIRES_IN=7d

# Google Calendar OAuth (Phase 4B)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/calendar/callback

# Twilio SMS (Phase 1 - Week 1)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# SendGrid Email (Phase 1 - Week 1)
SENDGRID_API_KEY=your-api-key
SENDGRID_FROM_EMAIL=noreply@budgetdrive.com

# BSV Blockchain (Phase 3)
BSV_PRIVATE_KEY=your-private-key-wif
TREASURY_BSV_ADDRESS=your-treasury-address
```

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:3000/api/v1
```

---

## 8. Craig Wright Philosophy Alignment

**Core Principles:**
1. **Cost-Based Pricing** - Fees reflect actual computational cost (5 sats per booking)
2. **Fixed Satoshi Fees** - NOT percentage-based extraction
3. **Scales at Volume** - Profitability comes from millions of transactions
4. **No Rent-Seeking** - One-time licensing + tiny protocol fees only
5. **Honest Money** - Transparent, fair, economically sound

**Business Model (Nov 11, 2025 Decision):**
- **License Once, Use Forever:** $2,500-$10,000 one-time fee
- **Satoshi Protocol Fees:** 5 sats per booking (~$0.000002 USD)
- **No Monthly Subscriptions:** Schools own the software
- **Optional Services:** Support, training, custom integrations (actual work = actual payment)

**Revenue Projections:**
- Year 1: 100 schools × $4,500 avg = $450,000
- Year 2: 250 schools = $1,205,000
- Year 3: 500 schools = $2,407,000
- 5-Year Total: $6.5M+ from licenses + passive satoshi fees

**Competitive Advantage vs DriveScout:**
- DriveScout: $3,000/year FOREVER (rent-seeking)
- BDP: $2,500 ONCE + satoshi fees
- Savings: $12,750 over 5 years (83% cheaper)

---

## 9. Patent Claims (Summary)

### Claim #1: Hybrid Scheduling with On-Chain Conflict Resolution
- 6D conflict detection algorithm
- Blockchain immutability
- Buffer time management
- Status: Implemented ([schedulingService.ts:417](backend/src/services/schedulingService.ts))

### Claim #2: Self-Funding Treasury via Satoshi-Level Transaction Fees
- Satoshi-denominated fees (5 sats per booking)
- Craig Wright philosophy alignment
- Treasury wallet accumulation
- Status: Implemented ([treasuryService.ts:358](backend/src/services/treasuryService.ts))

### Claim #3: Stable Engagement Credits (MNEE Integration)
- Treasury-funded token issuance
- USD-pegged value
- Redeemable for lessons
- Status: Planned (Phase 2)

### Claim #4: Hidden Blockchain Layer
- Fiat UX abstraction
- Backend blockchain execution
- "Instant Pay" terminology
- Status: Implemented

### Claim #5: On-Chain Gig Worker Verification
- Background check hashing
- Immutable attestation
- Zero-knowledge verification
- Status: Planned (Phase 4)

---

## 10. Key Business Metrics

### TAM (Total Addressable Market)
- **US Driving Schools:** 23,946
- **Annual Lessons:** ~359 million
- **Transaction Value:** ~$18 billion/year
- **BDP Addressable:** 5% market share = 1,197 schools, $21.5M revenue (Year 3+)

### Target Adoption
- **Year 1:** 100 schools (0.4% market share)
- **Year 2:** 250 schools (1.0% market share)
- **Year 3:** 500 schools (2.1% market share)
- **Year 5:** 1,200 schools (5.0% market share)

### Treasury Economics (at scale)
- **100M bookings/year × 5 sats = 5 BSV**
- At BSV=$47: $235/year (passive income)
- At BSV=$10,000: $50,000/year (Wright target)

---

## 11. Next Session Checklist

**When Claude starts a new session, remember:**

1. ✅ **Treasury is satoshi-based** (NOT 1% percentage)
2. ✅ **BDP_BOOK = 5 sats** (~$0.000002 USD)
3. ✅ **Business model:** One-time licensing + satoshi fees
4. ✅ **Competitive analysis:** DriveScout charges $3k/year (rent-seeking)
5. ✅ **Current phase:** Treasury testing + Notifications (hybrid approach)
6. ✅ **Patent filing:** Q1 2026 target
7. ✅ **Philosophy:** Craig Wright aligned (cost-based, no extraction)

**Current Todo List:**
1. 🔄 Clean up unnecessary files
2. ⏳ Complete treasury testing with lesson bookings
3. ⏳ Integrate Twilio for SMS notifications
4. ⏳ Integrate SendGrid for email notifications
5. ⏳ Hook notifications into notification_queue table
6. ⏳ Build instructor earnings reports
7. ⏳ Create public booking widget (embeddable)

**Files to Always Check:**
- `DEVELOPMENT_LOG.md` - Comprehensive history
- `PATENT_DOCUMENTATION.md` - Patent claims and technical disclosure
- `TREASURY_TEST_GUIDE.md` - Testing instructions
- `PROJECT_SCHEMA_REFERENCE.md` - THIS FILE

---

**End of Schema Reference**
**Last Updated:** November 11, 2025, 4:30 PM PST
**Next Review:** After treasury testing completion

# Budget Driving School - Development Log

**Project Start Date:** November 2025
**Current Phase:** Phase 4A (Smart Scheduling Foundation) - COMPLETED
**Last Updated:** November 8, 2025

---

## Table of Contents

1. [Project Vision & Goals](#project-vision--goals)
2. [Architecture Overview](#architecture-overview)
3. [Development Phases](#development-phases)
4. [Session History](#session-history)
5. [Technical Decisions & Rationale](#technical-decisions--rationale)
6. [Database Schema Evolution](#database-schema-evolution)
7. [API Endpoints Catalog](#api-endpoints-catalog)
8. [Known Issues & Resolutions](#known-issues--resolutions)
9. [Next Steps & Roadmap](#next-steps--roadmap)

---

## Project Vision & Goals

### Business Vision
Create a comprehensive driving school management system that can be a "gamechanger" for the industry, focusing on:
- Multi-tenant architecture (support multiple driving schools)
- Smart scheduling with instructor calendar integration
- Automated conflict prevention
- Streamlined admin operations
- Future student self-service portal

### Key User Stories
1. **Admin**: "I want to see when instructors are available next and book lessons without conflicts"
2. **Instructor**: "I want my work calendar to sync with my personal calendar (Google Calendar)"
3. **Student**: "I want to book lessons at times that work for both me and my instructor" (Phase 4B+)
4. **Admin**: "I want to be automatically notified of scheduling conflicts"

### Core Differentiators
- **Two-way Google Calendar sync** (planned Phase 4B)
- **Intelligent slot finding** with gap detection
- **6-dimensional conflict detection** (instructor, vehicle, student, time off, working hours, buffer times)
- **Flexible vehicle assignment** (school-owned vs instructor-owned)
- **Buffer time management** to prevent instructor burnout

---

## Architecture Overview

### Technology Stack

**Backend:**
- Node.js with TypeScript
- Express.js (RESTful API)
- PostgreSQL (multi-tenant database)
- ts-node (development)
- nodemon (auto-reload)

**Frontend:**
- React 18 with TypeScript
- Vite (build tool)
- React Router (navigation)
- Tailwind CSS (styling)
- Lucide React (icons)

**Database:**
- PostgreSQL with UUID primary keys
- Multi-tenant with tenant_id isolation
- Foreign key constraints
- Composite indexes for performance

**Development Environment:**
- Windows (primary)
- Backend: http://localhost:3000
- Frontend: http://localhost:5173
- Database: PostgreSQL (local instance)

### Multi-Tenant Architecture

Every table includes `tenant_id` for data isolation:
```sql
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
```

All queries filter by tenant_id:
```typescript
const tenantId = getTenantId(req); // From JWT or header
query('SELECT * FROM table WHERE tenant_id = $1', [tenantId]);
```

### Authentication Flow
1. User logs in → receives JWT token
2. Token contains user_id and tenant_id
3. `authenticate` middleware validates token
4. `requireTenantContext` middleware extracts tenant_id
5. All downstream queries use tenant_id for isolation

---

## Development Phases

### Phase 1: Database Foundation ✓ COMPLETED
**Goal:** Set up PostgreSQL database with core tables

**Deliverables:**
- Migration: `001_initial_schema.sql`
- Tables created:
  - tenants
  - users
  - students
  - instructors
  - vehicles
  - lessons
  - payments
  - lesson_packages

**Key Decisions:**
- Used UUIDs for all primary keys (better for distributed systems)
- Soft deletes where appropriate (preserve audit trail)
- Timestamps on all tables (created_at, updated_at)
- Auto-updating triggers for updated_at columns

**Files:**
- `backend/database/setup-db.js` - Database initialization
- `backend/database/run-migration.js` - Migration runner
- `backend/database/migrations/001_initial_schema.sql` - Schema (450+ lines)

---

### Phase 2: Backend API ✓ COMPLETED
**Goal:** Build RESTful API with Express.js

**Deliverables:**
- Environment configuration with validation
- Database connection pooling
- Middleware stack (auth, validation, error handling, tenant context)
- CRUD services for all entities
- Controller layer with async error handling
- Route definitions with validation

**File Structure:**
```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts (PostgreSQL connection pool)
│   │   └── env.ts (environment validation)
│   ├── middleware/
│   │   ├── auth.ts (JWT authentication)
│   │   ├── errorHandler.ts (centralized error handling)
│   │   ├── tenantContext.ts (multi-tenant isolation)
│   │   └── validate.ts (input validation & sanitization)
│   ├── services/
│   │   ├── tenantService.ts
│   │   ├── studentService.ts
│   │   ├── instructorService.ts
│   │   ├── vehicleService.ts
│   │   ├── lessonService.ts
│   │   ├── paymentService.ts
│   │   ├── availabilityService.ts (Phase 4A)
│   │   └── schedulingService.ts (Phase 4A)
│   ├── controllers/
│   │   ├── tenantController.ts
│   │   ├── studentController.ts
│   │   ├── instructorController.ts
│   │   ├── vehicleController.ts
│   │   ├── lessonController.ts
│   │   ├── paymentController.ts
│   │   └── availabilityController.ts (Phase 4A)
│   ├── routes/
│   │   ├── tenantRoutes.ts
│   │   ├── studentRoutes.ts
│   │   ├── instructorRoutes.ts
│   │   ├── vehicleRoutes.ts
│   │   ├── lessonRoutes.ts
│   │   ├── paymentRoutes.ts
│   │   └── availabilityRoutes.ts (Phase 4A)
│   ├── types/
│   │   └── index.ts (TypeScript interfaces)
│   ├── app.ts (Express app configuration)
│   └── index.ts (Server entry point)
```

**Key Patterns:**
- Service layer handles business logic
- Controllers handle HTTP concerns
- Middleware chain: auth → tenant → validation → controller → service
- Centralized error handling with custom AppError class
- Async/await with asyncHandler wrapper

---

### Phase 3: Frontend Application ✓ COMPLETED
**Goal:** Build React admin interface

**Deliverables:**
- React app with TypeScript
- Multi-page routing
- Component library
- API integration layer
- Tailwind CSS styling

**File Structure:**
```
frontend/
├── src/
│   ├── components/ (reusable UI components)
│   ├── pages/ (route pages)
│   ├── services/ (API calls)
│   ├── hooks/ (custom React hooks)
│   ├── utils/ (helper functions)
│   ├── App.tsx (main app component)
│   └── main.tsx (entry point)
```

**Pages Implemented:**
- Dashboard (overview)
- Students (list, create, view, edit)
- Instructors (list, create, view, edit)
- Vehicles (list, create, view, edit)
- Lessons (list, schedule, view, edit)
- Payments (list, record, view)
- Settings (tenant configuration)

**UI Components:**
- Tables with pagination
- Forms with validation
- Modals for create/edit
- Alert notifications
- Loading states
- Error boundaries

---

### Phase 4A: Smart Scheduling Foundation ✓ COMPLETED
**Goal:** Build intelligent scheduling system (without external calendar integration)

**Timeline:** Completed November 8, 2025

#### Requirements Gathering (User Answers)

**Q1: How should instructors set their working hours?**
> "I want instructors to be able to set when they are working, but have the ability for admin to make the final choice or make adjustments"

**Implementation:**
- Instructors can create availability entries
- Admin has override permissions
- `instructor_availability` table with `is_active` flag

**Q2: What buffer time between lessons?**
> "30 minute buffer time between lessons would be nice to start"

**Implementation:**
- `scheduling_settings.buffer_time_between_lessons = 30` (default)
- Configurable per tenant
- `allow_back_to_back_lessons` flag for flexibility

**Q3: Who can schedule lessons initially?**
> "admin only for now, students being able to schedule could be added later"

**Implementation:**
- All scheduling endpoints require authentication
- Student self-booking deferred to Phase 4C+
- API designed to support both (just needs frontend)

**Q4: How should vehicles be assigned?**
> "if the instructor uses their personal vehicle, then assign it to them. If the school owns fleet, assign as needed based on availability"

**Implementation:**
- `vehicles.ownership_type`: 'school_owned' | 'instructor_owned' | 'leased'
- `vehicles.instructor_id`: Links instructor-owned vehicles
- `instructors.prefers_own_vehicle`: Instructor preference flag
- `instructors.default_vehicle_id`: Default vehicle assignment
- Slot finding algorithm checks vehicle ownership and availability

**Q5: What notifications are needed?**
> "24 hr notice and 1hr notice before lesson"

**Implementation:**
- `notification_queue` table for scheduled notifications
- `scheduled_for` timestamp (lesson_time - 24hrs and lesson_time - 1hr)
- Status tracking: 'pending' | 'sent' | 'failed'
- Retry logic with `retry_count`
- Supports 'email' | 'sms' | 'both'

**Q6: Additional features?**
> "multi-view like week, day, month calendar would be nice. Also defer recurring lessons / packages"

**Implementation:**
- Calendar views: Deferred to frontend Phase 4B
- Recurring lessons: Deferred to Phase 4C (separate feature)
- `lesson_packages` table already exists from Phase 1

#### Deliverables

**1. Database Migration: `002_instructor_availability.sql`**
- 4 new tables (233 lines)
- Schema modifications to existing tables
- 12 new indexes for performance
- Auto-update triggers

**2. Backend Services**
- `availabilityService.ts` (449 lines)
  - CRUD for instructor availability
  - CRUD for time off requests
  - Scheduling settings management
- `schedulingService.ts` (417 lines)
  - Smart slot finding algorithm
  - 6-dimensional conflict detection
  - Booking validation

**3. API Controllers & Routes**
- `availabilityController.ts` (327 lines)
- `availabilityRoutes.ts` (139 lines)
- 17 new REST endpoints

**4. TypeScript Types**
- Added 6 new interfaces to `types/index.ts`
- Full type safety across scheduling domain

#### Technical Implementation

**Smart Slot Finding Algorithm:**
```
findAvailableSlots(request):
  1. Get tenant scheduling settings (buffer times, etc.)
  2. Get list of instructors to check
  3. For each day in date range:
      a. Get day of week (0-6)
      b. For each instructor:
         - Query instructor_availability for this day
         - Check for time_off on this date
         - Get existing lessons on this date
         - For each availability block:
           * Find gaps between lessons
           * Apply buffer times
           * Generate TimeSlot objects
  4. Return array of available slots
```

**Conflict Detection (6 Types):**
1. **outside_working_hours**: Check `instructor_availability` for day/time
2. **time_off**: Check `instructor_time_off` for date overlap
3. **instructor_busy**: Check `lessons` for instructor overlap
4. **buffer_violation**: Check lessons within buffer period
5. **vehicle_busy**: Check `lessons` for school-owned vehicle overlap
6. **student_busy**: Check `lessons` for student overlap

**Vehicle Assignment Logic:**
```typescript
if (requestedVehicleId) {
  use requestedVehicleId;
} else if (instructor.prefers_own_vehicle && instructor.default_vehicle_id) {
  use instructor.default_vehicle_id;
} else {
  vehicleId = null; // Assign later or use first available school vehicle
}
```

#### Bugs Fixed During Phase 4A

**Bug 1: Missing tenant_id Column**
- Error: `column "tenant_id" does not exist`
- Root Cause: Migration had tenant_id in constraint but not in column list
- Fix: Added `ALTER TABLE` to add column and index
- Impact: All scheduling queries require tenant_id

**Bug 2: Wrong Import Path**
- Error: `Cannot find module '../middleware/validation'`
- Root Cause: File is named `validate.ts` not `validation.ts`
- Fix: Changed import in `availabilityRoutes.ts`
- Impact: Route file wouldn't compile

**Bug 3: TypeScript Strict Mode Errors (4 errors)**
- Error 1: `'AppError' is declared but its value is never read`
  - Fix: Removed unused import from `schedulingService.ts`
- Error 2: `'minutesToTime' is declared but its value is never read`
  - Fix: Removed unused helper function
- Error 3: `'studentId' is declared but its value is never read`
  - Fix: Removed from destructuring (may be used in future enhancement)
- Error 4: `Type 'string | undefined' not assignable to 'string | null'`
  - Fix: Added explicit type annotation: `let vehicleForLesson: string | null = vehicleId || null;`
- Impact: Backend server wouldn't start

**Bug 4: Unused Route Import**
- Error: `'availabilityRoutes' is declared but its value is never read`
- Root Cause: Import added but route not registered
- Fix: Added `app.use(API_PREFIX, availabilityRoutes);` in app.ts
- Impact: Availability endpoints weren't accessible

#### API Endpoints Added (17 total)

**Instructor Availability (6 endpoints):**
```
GET    /api/v1/availability/all
GET    /api/v1/availability/instructor/:instructorId
POST   /api/v1/availability/instructor/:instructorId
POST   /api/v1/availability/instructor/:instructorId/schedule
PUT    /api/v1/availability/:id
DELETE /api/v1/availability/:id
```

**Time Off Management (4 endpoints):**
```
GET    /api/v1/availability/instructor/:instructorId/time-off
POST   /api/v1/availability/instructor/:instructorId/time-off
PUT    /api/v1/availability/time-off/:id
DELETE /api/v1/availability/time-off/:id
```

**Scheduling Settings (2 endpoints):**
```
GET    /api/v1/availability/settings
PUT    /api/v1/availability/settings
```

**Smart Scheduling (3 endpoints):**
```
POST   /api/v1/availability/find-slots
POST   /api/v1/availability/check-conflicts
POST   /api/v1/availability/validate-booking
```

**Example Request: Find Available Slots**
```http
POST /api/v1/availability/find-slots
Content-Type: application/json
Authorization: Bearer <jwt-token>
X-Tenant-ID: <tenant-uuid>

{
  "instructorId": "optional-uuid",
  "vehicleId": "optional-uuid",
  "startDate": "2025-11-10",
  "endDate": "2025-11-16",
  "duration": 60,
  "studentId": "optional-uuid"
}
```

**Example Response:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "startTime": "2025-11-10T09:00:00.000Z",
      "endTime": "2025-11-10T10:00:00.000Z",
      "instructorId": "abc-123",
      "vehicleId": "def-456",
      "duration": 60
    }
  ]
}
```

#### Database Tables Added

**instructor_availability**
```sql
CREATE TABLE instructor_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_instructor_day_time UNIQUE (instructor_id, day_of_week, start_time, end_time)
);
```

**instructor_time_off**
```sql
CREATE TABLE instructor_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(100),
    notes TEXT,
    is_approved BOOLEAN DEFAULT true,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CHECK (end_date >= start_date)
);
```

**scheduling_settings**
```sql
CREATE TABLE scheduling_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    buffer_time_between_lessons INTEGER DEFAULT 30,
    buffer_time_before_first_lesson INTEGER DEFAULT 15,
    buffer_time_after_last_lesson INTEGER DEFAULT 15,
    min_hours_advance_booking INTEGER DEFAULT 24,
    max_days_advance_booking INTEGER DEFAULT 90,
    default_lesson_duration INTEGER DEFAULT 60,
    allow_back_to_back_lessons BOOLEAN DEFAULT false,
    default_work_start_time TIME DEFAULT '09:00:00',
    default_work_end_time TIME DEFAULT '17:00:00',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**notification_queue**
```sql
CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('student', 'instructor')),
    recipient_id UUID NOT NULL,
    notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('email', 'sms', 'both')),
    scheduled_for TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    sent_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Performance Considerations

**Indexes Created (12 total):**
1. `idx_instructor_availability_instructor` (instructor_id, day_of_week)
2. `idx_instructor_availability_tenant` (tenant_id)
3. `idx_instructor_availability_day` (day_of_week)
4. `idx_instructor_time_off_instructor` (instructor_id)
5. `idx_instructor_time_off_tenant` (tenant_id)
6. `idx_instructor_time_off_dates` (start_date, end_date)
7. `idx_vehicles_instructor` (instructor_id)
8. `idx_scheduling_settings_tenant` (tenant_id)
9. `idx_notification_queue_tenant` (tenant_id)
10. `idx_notification_queue_scheduled` (scheduled_for, status)
11. `idx_notification_queue_lesson` (lesson_id)
12. `idx_notification_queue_status` (status)

**Query Optimization Notes:**
- Day of week lookup uses composite index (instructor_id, day_of_week)
- Date range queries use start_date, end_date index
- Notification processing uses (scheduled_for, status) for efficient polling
- All multi-tenant queries use tenant_id index

**Scalability Considerations:**
- Slot finding could be CPU-intensive for large date ranges
- Consider caching availability schedules (they change infrequently)
- Notification queue could benefit from job queue (Bull, BullMQ)
- Database could be partitioned by tenant_id for very large deployments

---

## Session History

### Session 1: Project Recovery & Phase 1-3 Implementation
**Date:** November 2025
**Outcome:** Completed Phases 1, 2, and 3

**Key Events:**
1. User mentioned previous session data was lost
2. Started from scratch with database setup
3. Implemented full backend API
4. Built React frontend
5. Both servers running successfully

### Session 2: Phase 4A Planning & Implementation
**Date:** November 8, 2025
**Outcome:** Completed Phase 4A scheduling foundation

**Conversation Flow:**
1. User asked about calendar functionality
2. Discussed vision for Google Calendar sync and smart scheduling
3. Asked 6 clarification questions about requirements
4. User agreed to build Phase 4A (foundation) before 4B (integration)
5. Implemented database schema, services, controllers, routes
6. Hit compilation errors
7. Fixed all bugs
8. Created comprehensive documentation
9. **User requested:** "make sure this is all being logged professionally please. I dont want to forget or lose any valuable info"

**User Quotes (Important Context):**
- "I think this can be a gamechanger"
- "We need to keep best development/business practices in mind"
- "We need to periodically check in to make sure we stay on track with the vision"
- "30 minute buffer time between lessons would be nice to start"
- "admin only for now, students being able to schedule could be added later"

---

## Technical Decisions & Rationale

### Why UUIDs Instead of Auto-Incrementing Integers?
**Decision:** Use `UUID` (gen_random_uuid()) for all primary keys

**Rationale:**
- Better for distributed systems (no coordination needed)
- Prevents enumeration attacks
- Easier to merge data from multiple sources
- Future-proof for microservices migration
- No performance impact with proper indexing

**Trade-offs:**
- Slightly larger storage (16 bytes vs 4-8 bytes)
- Not human-readable
- Mitigated by: Using btree indexes, displaying friendly IDs in UI

### Why Soft Deletes for Availability?
**Decision:** Use `is_active = false` instead of DELETE for `instructor_availability`

**Rationale:**
- Preserve historical data for auditing
- Allow "undo" functionality
- Track when schedules changed
- Required for compliance/legal reasons

**Trade-offs:**
- Queries must filter `is_active = true`
- Table grows over time
- Mitigated by: Indexes on is_active, periodic archiving

### Why Hard Deletes for Time Off?
**Decision:** Use DELETE for `instructor_time_off`

**Rationale:**
- One-time events (not recurring)
- No historical value after the date passes
- Simpler queries (no is_active filtering)
- Reduces table size

### Why Separate instructor_availability and instructor_time_off?
**Decision:** Two tables instead of single "availability" table

**Rationale:**
- Different use cases:
  - `instructor_availability`: Recurring weekly pattern
  - `instructor_time_off`: One-time date ranges
- Simpler queries (don't mix recurring and one-time logic)
- Different retention policies (soft vs hard delete)
- Clearer data model

**Alternative Considered:**
- Single table with `type` column ('recurring' | 'one_time')
- Rejected: More complex queries, harder to maintain constraints

### Why Buffer Time in scheduling_settings Instead of Per-Instructor?
**Decision:** Tenant-level buffer time configuration

**Rationale:**
- Consistency across organization
- Simpler for admins to manage
- Can override per-lesson if needed (buffer_time_after in lessons table)
- Business rule: "All our instructors get 30 min breaks"

**Future Enhancement:**
- Add `instructors.custom_buffer_time` for exceptions
- Fallback logic: Use instructor.custom_buffer_time || settings.buffer_time_between_lessons

### Why allowBackToBackLessons Flag?
**Decision:** Configurable override for buffer requirement

**Rationale:**
- Some driving schools may want tight scheduling
- Emergency situations (makeup lessons)
- Instructor preference (some don't need breaks)
- Gives admins flexibility

**Implementation:**
- Flag in scheduling_settings
- Only checked during conflict detection
- Slot finding always respects buffer (returns more slots)

### Why Vehicle Ownership Type?
**Decision:** Enum: 'school_owned' | 'instructor_owned' | 'leased'

**Rationale:**
- Different availability rules:
  - School-owned: Check conflicts across all instructors
  - Instructor-owned: Only check conflicts for that instructor
  - Leased: Same as school-owned
- Different maintenance tracking
- Different cost allocation
- Insurance implications

### Why Notification Queue Instead of Immediate Send?
**Decision:** Queue notifications instead of sending during lesson creation

**Rationale:**
- Decouple scheduling from notification sending
- Handle failures gracefully (retry logic)
- Send at specific times (24hr, 1hr before)
- Batch sending for efficiency
- Support multiple channels (email, SMS)

**Future Enhancement:**
- Background job processor (Bull/BullMQ)
- Webhook for external notification services
- User preferences for notification timing

---

## Database Schema Evolution

### Schema Version 1: Initial Tables (Phase 1)
```
tenants
users
students
instructors
vehicles
lessons
payments
lesson_packages
```

### Schema Version 2: Scheduling Foundation (Phase 4A)
**Added Tables:**
```
instructor_availability
instructor_time_off
scheduling_settings
notification_queue
```

**Modified Tables:**
```
vehicles:
  + instructor_id UUID
  + ownership_type VARCHAR(50)

instructors:
  + prefers_own_vehicle BOOLEAN
  + default_vehicle_id UUID

lessons:
  + buffer_time_after INTEGER
```

### Future Schema (Phase 4B - Google Calendar)
**Planned Tables:**
```
calendar_integrations:
  - id UUID
  - tenant_id UUID
  - instructor_id UUID
  - calendar_type ('google' | 'outlook' | 'apple')
  - access_token TEXT (encrypted)
  - refresh_token TEXT (encrypted)
  - token_expires_at TIMESTAMP
  - calendar_id VARCHAR(255)
  - is_active BOOLEAN
  - sync_direction ('one_way' | 'two_way')
  - last_sync_at TIMESTAMP

calendar_events:
  - id UUID
  - tenant_id UUID
  - instructor_id UUID
  - lesson_id UUID (nullable)
  - external_event_id VARCHAR(255)
  - calendar_integration_id UUID
  - event_type ('lesson' | 'personal' | 'other')
  - summary TEXT
  - start_time TIMESTAMP
  - end_time TIMESTAMP
  - is_synced BOOLEAN
```

### Future Schema (Phase 4C+ - Recurring Lessons)
**Planned Tables:**
```
recurring_lesson_patterns:
  - id UUID
  - tenant_id UUID
  - student_id UUID
  - instructor_id UUID
  - vehicle_id UUID
  - recurrence_type ('daily' | 'weekly' | 'monthly')
  - recurrence_interval INTEGER
  - days_of_week INTEGER[] (for weekly)
  - start_time TIME
  - duration INTEGER
  - start_date DATE
  - end_date DATE
  - is_active BOOLEAN
```

---

## API Endpoints Catalog

### Authentication
```
POST   /api/v1/auth/login
POST   /api/v1/auth/register
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

### Tenants
```
GET    /api/v1/tenants
POST   /api/v1/tenants
GET    /api/v1/tenants/:id
PUT    /api/v1/tenants/:id
DELETE /api/v1/tenants/:id
GET    /api/v1/tenant/settings
PUT    /api/v1/tenant/settings
```

### Students
```
GET    /api/v1/students
POST   /api/v1/students
GET    /api/v1/students/:id
PUT    /api/v1/students/:id
DELETE /api/v1/students/:id
GET    /api/v1/students/:id/lessons
GET    /api/v1/students/:id/payments
```

### Instructors
```
GET    /api/v1/instructors
POST   /api/v1/instructors
GET    /api/v1/instructors/:id
PUT    /api/v1/instructors/:id
DELETE /api/v1/instructors/:id
GET    /api/v1/instructors/:id/lessons
GET    /api/v1/instructors/:id/availability (Phase 4A)
```

### Vehicles
```
GET    /api/v1/vehicles
POST   /api/v1/vehicles
GET    /api/v1/vehicles/:id
PUT    /api/v1/vehicles/:id
DELETE /api/v1/vehicles/:id
```

### Lessons
```
GET    /api/v1/lessons
POST   /api/v1/lessons
GET    /api/v1/lessons/:id
PUT    /api/v1/lessons/:id
DELETE /api/v1/lessons/:id
PATCH  /api/v1/lessons/:id/status
```

### Payments
```
GET    /api/v1/payments
POST   /api/v1/payments
GET    /api/v1/payments/:id
PUT    /api/v1/payments/:id
DELETE /api/v1/payments/:id
```

### Availability & Scheduling (Phase 4A)
```
GET    /api/v1/availability/all
GET    /api/v1/availability/instructor/:instructorId
POST   /api/v1/availability/instructor/:instructorId
POST   /api/v1/availability/instructor/:instructorId/schedule
PUT    /api/v1/availability/:id
DELETE /api/v1/availability/:id
GET    /api/v1/availability/instructor/:instructorId/time-off
POST   /api/v1/availability/instructor/:instructorId/time-off
PUT    /api/v1/availability/time-off/:id
DELETE /api/v1/availability/time-off/:id
GET    /api/v1/availability/settings
PUT    /api/v1/availability/settings
POST   /api/v1/availability/find-slots
POST   /api/v1/availability/check-conflicts
POST   /api/v1/availability/validate-booking
```

**Total Endpoints:** ~60+ (with all CRUD operations)

---

## Known Issues & Resolutions

### Fixed Issues

#### 1. Missing tenant_id Column (Phase 4A)
**Status:** RESOLVED
**Date:** November 8, 2025
**Impact:** Database migration failed

**Error:**
```
ERROR: column "tenant_id" does not exist
```

**Root Cause:**
Migration file had tenant_id in the REFERENCES constraint but didn't create the column first.

**Resolution:**
```sql
ALTER TABLE instructor_availability
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_instructor_availability_tenant
ON instructor_availability(tenant_id);
```

**Lessons Learned:**
- Always add columns before referencing them in constraints
- Use `IF NOT EXISTS` for idempotent migrations
- Test migrations on fresh database

---

#### 2. Wrong Import Path (Phase 4A)
**Status:** RESOLVED
**Date:** November 8, 2025
**Impact:** TypeScript compilation failed

**Error:**
```
Cannot find module '../middleware/validation' or its corresponding type declarations
```

**Root Cause:**
File is named `validate.ts` but import used `validation`

**Resolution:**
Changed import in `availabilityRoutes.ts`:
```typescript
import { validateRequired, validateUUID } from '../middleware/validate';
```

**Lessons Learned:**
- Verify file names match imports
- Use IDE auto-import to prevent typos
- Consider renaming middleware/validate.ts to middleware/validation.ts for clarity

---

#### 3. TypeScript Strict Mode Errors (Phase 4A)
**Status:** RESOLVED
**Date:** November 8, 2025
**Impact:** Backend server wouldn't start

**Errors:**
1. `'AppError' is declared but its value is never read`
2. `'minutesToTime' is declared but its value is never read`
3. `'studentId' is declared but its value is never read`
4. `Type 'string | undefined' not assignable to 'string | null'`

**Resolution:**
1. Removed unused import
2. Removed unused helper function
3. Removed from destructuring
4. Added explicit type annotation:
```typescript
let vehicleForLesson: string | null = vehicleId || null;
```

**Lessons Learned:**
- Use linter to catch unused code before committing
- TypeScript strict mode is valuable for catching errors
- Type unions require careful handling (undefined vs null)

---

#### 4. Unused Route Import (Phase 4A)
**Status:** RESOLVED
**Date:** November 8, 2025
**Impact:** Availability endpoints not accessible

**Error:**
```
'availabilityRoutes' is declared but its value is never read
```

**Root Cause:**
Import added but route not registered in app.ts

**Resolution:**
```typescript
app.use(API_PREFIX, availabilityRoutes);
```

**Lessons Learned:**
- After creating new route file, must register in app.ts
- Test endpoints after adding routes
- Consider integration test that verifies all routes are registered

---

### Open Issues

#### None Currently

All known issues have been resolved as of November 8, 2025.

---

## Next Steps & Roadmap

### Immediate Next Steps (Frontend for Phase 4A)

**Priority 1: Instructor Availability Management**
- [ ] Create calendar week view component
  - Display Mon-Sun with time slots
  - Color-code availability blocks
  - Click to add availability
- [ ] Build availability editor modal
  - Day of week selector
  - Start/end time pickers
  - Notes field
  - Save/cancel buttons
- [ ] Integrate with API
  - GET instructor availability
  - POST new availability blocks
  - PUT update existing
  - DELETE remove blocks
- [ ] Build "Set Complete Schedule" form
  - Bulk add Mon-Fri 9am-5pm
  - Copy previous week
  - Clear all and start over

**Priority 2: Time Off Management**
- [ ] Create time off request form
  - Date range picker
  - Reason dropdown (vacation, sick, personal, training, other)
  - Notes field
  - Approval workflow
- [ ] Build time off calendar view
  - Show time off periods on calendar
  - Highlight days with time off
  - Click to edit/delete
- [ ] Admin approval interface
  - List pending requests
  - Approve/deny buttons
  - Notification on approval

**Priority 3: Smart Booking Interface**
- [ ] Create lesson booking form with slot picker
  - Select student dropdown
  - Select instructor (or "any available")
  - Select date range
  - Select duration
  - Click "Find Slots" button
- [ ] Display available slots
  - List view or calendar view
  - Show instructor name, vehicle, time
  - "Book This Slot" button
- [ ] Conflict validation
  - Real-time checking during booking
  - Display conflict messages
  - Suggest alternative times

**Priority 4: Scheduling Settings**
- [ ] Build settings form
  - Buffer time sliders
  - Advance booking inputs
  - Default work hours
  - Allow back-to-back toggle
- [ ] Save/restore settings
  - GET current settings
  - PUT updated settings
  - Show success message

---

### Phase 4B: Google Calendar Integration

**Goal:** Two-way sync between instructor calendars and system

**Requirements:**
1. OAuth 2.0 flow for Google Calendar access
2. Webhook for real-time updates
3. Sync instructor availability from Google Calendar
4. Create lessons as calendar events
5. Handle external event conflicts
6. Support multiple calendar providers (Google, Outlook, Apple)

**Technical Tasks:**
- [ ] Set up Google Calendar API credentials
- [ ] Implement OAuth 2.0 flow (authorization code grant)
- [ ] Store encrypted tokens in database
- [ ] Build calendar sync service
  - Fetch events from Google Calendar
  - Create events in Google Calendar
  - Update events on both sides
  - Delete events on both sides
- [ ] Implement webhook handler for push notifications
- [ ] Build conflict resolution UI
  - Show external events on calendar
  - Detect conflicts with driving school schedule
  - Allow instructor to choose which takes precedence
- [ ] Add calendar settings to instructor profile
  - Select calendar to sync
  - Choose sync direction (one-way or two-way)
  - Set sync frequency
  - Test connection button

**Database Changes:**
- Create `calendar_integrations` table
- Create `calendar_events` table
- Add `external_event_id` to lessons table

**Security Considerations:**
- Encrypt access/refresh tokens at rest
- Use HTTPS for OAuth redirect
- Validate webhook signatures
- Rate limiting on calendar API calls
- Handle token expiration gracefully

---

### Phase 4C: Recurring Lessons & Packages

**Goal:** Support recurring lesson patterns and pre-paid packages

**Requirements:**
1. Define recurring lesson patterns (weekly, bi-weekly, monthly)
2. Auto-generate lessons from pattern
3. Handle exceptions (skip holidays)
4. Link lessons to lesson packages
5. Track package usage (X lessons remaining)

**Technical Tasks:**
- [ ] Create `recurring_lesson_patterns` table
- [ ] Build pattern creation UI
  - Frequency selector
  - Days of week (for weekly)
  - Duration
  - Start/end dates
  - Auto-generate button
- [ ] Implement pattern generation logic
  - Calculate dates based on frequency
  - Check availability for each date
  - Create lessons in batch
  - Handle conflicts
- [ ] Build package management UI
  - Create package (X lessons for $Y)
  - Assign package to student
  - Track usage (lessons used / total)
  - Show expiration date
- [ ] Link lessons to packages
  - Auto-deduct from package on lesson completion
  - Prevent double-charging
  - Show package balance

---

### Phase 5: Student Portal (Future)

**Goal:** Allow students to book their own lessons

**Requirements:**
1. Student login (separate from admin)
2. View available time slots
3. Book lessons (with instructor approval)
4. View upcoming lessons
5. Cancel/reschedule lessons
6. View payment history
7. Purchase lesson packages

**Technical Tasks:**
- [ ] Create student authentication
- [ ] Build student dashboard
- [ ] Implement self-booking flow
- [ ] Add instructor approval workflow
- [ ] Build cancellation policy enforcement
- [ ] Integrate payment gateway (Stripe/PayPal)

---

### Phase 6: Reporting & Analytics (Future)

**Goal:** Business intelligence and insights

**Requirements:**
1. Instructor utilization reports
2. Revenue reports
3. Student progress tracking
4. Vehicle usage reports
5. Cancellation trends
6. Popular time slots

**Technical Tasks:**
- [ ] Design reporting schema
- [ ] Build aggregation queries
- [ ] Create dashboard charts
- [ ] Implement export to PDF/Excel
- [ ] Add date range filters

---

### Phase 7: Mobile App (Future)

**Goal:** Native mobile apps for instructors and students

**Requirements:**
1. React Native or Flutter
2. Push notifications
3. Offline mode
4. GPS tracking (for lessons)
5. Digital signatures (lesson completion)

---

### Phase 8: Advanced Features (Future)

**Ideas to Consider:**
- SMS reminders (Twilio integration)
- Email marketing campaigns
- Referral program
- Online driver's ed courses
- DMV test scheduling
- Vehicle maintenance tracking
- Insurance document management
- Payroll for instructors
- Multi-language support
- Accessibility (WCAG compliance)

---

## Project Status

**Current Phase:** Phase 4A ✓ COMPLETED
**Next Phase:** Phase 4A Frontend Components
**Overall Progress:** ~40% complete

**What's Working:**
- ✓ Database with 12 tables
- ✓ Full backend API (~60 endpoints)
- ✓ React frontend (admin interface)
- ✓ Smart scheduling backend
- ✓ Multi-tenant architecture
- ✓ Authentication & authorization
- ✓ Input validation & sanitization
- ✓ Error handling
- ✓ Both servers running

**What's Next:**
- Frontend components for scheduling
- Google Calendar integration (Phase 4B)
- Testing & QA
- Deployment setup

**Servers:**
- Backend: http://localhost:3000 (Running)
- Frontend: http://localhost:5173 (Running)

---

## Development Standards & Best Practices

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Consistent naming:
  - camelCase for variables/functions
  - PascalCase for components/classes
  - snake_case for database columns
- Explicit return types on functions
- Avoid `any` type

### Database
- Always use parameterized queries (prevent SQL injection)
- Include tenant_id in all multi-tenant queries
- Use transactions for multi-step operations
- Add indexes for frequently queried columns
- Use UUIDs for primary keys
- Timestamp all tables (created_at, updated_at)

### API Design
- RESTful conventions
- Consistent response format:
  ```json
  {
    "success": true|false,
    "data": {...},
    "message": "...",
    "error": "..."
  }
  ```
- HTTP status codes:
  - 200: Success
  - 201: Created
  - 400: Bad request (validation error)
  - 401: Unauthorized
  - 403: Forbidden (insufficient permissions)
  - 404: Not found
  - 500: Server error
- Pagination for list endpoints (page, limit, total)
- Input validation on all POST/PUT
- Sanitize all user input

### Security
- Never store passwords in plaintext (bcrypt)
- Use JWT for authentication
- Validate tenant_id on every request
- Sanitize all SQL inputs
- Rate limiting on public endpoints
- HTTPS in production
- Encrypt sensitive data at rest
- Regular security audits

### Testing
- Unit tests for services
- Integration tests for API endpoints
- E2E tests for critical flows
- Test multi-tenant isolation
- Test error handling
- Test edge cases

### Git Workflow
- Feature branches
- Meaningful commit messages
- Pull request reviews
- Keep commits atomic
- Never commit secrets

### Documentation
- README with setup instructions
- API documentation (OpenAPI/Swagger)
- Database schema diagrams
- Architecture decision records
- Code comments for complex logic
- Keep this development log updated

---

## Important Reminders

1. **Multi-Tenant Isolation:** Every query MUST include tenant_id
2. **Input Validation:** Validate all user input before processing
3. **Error Handling:** Use try/catch and asyncHandler wrapper
4. **Database Migrations:** Always use migrations, never manual ALTER TABLE
5. **Type Safety:** Use TypeScript interfaces for all data structures
6. **Testing:** Test before committing
7. **Security:** Never expose sensitive data in logs or errors
8. **Performance:** Add indexes for frequently queried columns
9. **Backward Compatibility:** Don't break existing API contracts
10. **Documentation:** Update this log after major changes

---

## Contacts & Resources

**Project Owner:** Rob
**Development Start:** November 2025

**Key Resources:**
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Google Calendar API](https://developers.google.com/calendar/api/guides/overview)

**File Locations:**
- Project Root: `c:\Users\Rob\Documents\Budget-driving-app\`
- Backend: `c:\Users\Rob\Documents\Budget-driving-app\backend\`
- Frontend: `c:\Users\Rob\Documents\Budget-driving-app\frontend\`
- Database Migrations: `c:\Users\Rob\Documents\Budget-driving-app\backend\database\migrations\`
- Documentation:
  - `DEVELOPMENT_LOG.md` (this file)
  - `PHASE_4A_SUMMARY.md`
  - `README.md`

---

**Last Updated:** November 8, 2025
**Log Version:** 1.0
**Next Review:** After Phase 4A Frontend completion

---

*This log is a living document. Update it after completing each phase, fixing major bugs, or making architectural decisions.*

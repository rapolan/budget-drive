# Changelog

All notable changes to the Budget Driving School Management System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.7] - 2026-02-02

### Added - Instructor-Student Pairing Enhancements

**Database Schema Updates:**
- Added `home_zip_code` field to instructors table for home base location tracking
- Added `service_zip_codes` field to instructors table (comma-separated ZIP codes or prefixes)
- New migration: `039_add_instructor_location_fields.sql`

**Smart Booking Improvements:**
- **Assigned Instructor Priority**: Student's assigned instructor now appears first in dropdown with blue "Assigned" badge
- **Service Area Filtering**: Instructors are filtered based on their `service_zip_codes` - only shows instructors who serve the student's area
- **Home Base Proximity**: Uses instructor's `home_zip_code` as primary location for proximity matching (falls back to last lesson location)
- **Proximity Indicators with Emojis**: Modern badge system in instructor dropdown:
  - 🏠 "Very Close" (90+ score) - Same ZIP or very near
  - 📍 "Same Area" (70+ score) - Same region
  - 🚗 "Nearby" (50+ score) - Adjacent regions
  - 🗺️ "Far" (< 50 score) - Different regions
- Assigned instructor gets highlighted row with blue left border

**Sorting Logic:**
1. Assigned instructor appears first (if student has one)
2. Remaining instructors sorted by proximity score (closest first)
3. Instructors who don't serve the area are filtered out

**Files Modified:**
- `backend/database/migrations/039_add_instructor_location_fields.sql` (NEW)
- `frontend/src/types/index.ts` - Added `homeZipCode` and `serviceZipCodes` to Instructor type
- `frontend/src/components/scheduling/SmartBookingForm.tsx` - Enhanced instructor filtering and sorting

**Future Enhancement (Saved for Later):**
- Auto-assignment algorithm based on proximity, availability, and workload balance

---

## [0.5.6] - 2026-02-01

### Changed - StudentModal UI/UX Improvements

**Existing Student View Enhancements:**
- Added prominent "Book Lesson" button in modal header for quick access
- Circular avatar with initials replaces gradient icon box
- Tabs changed to modern pill/segment control style (white active tab with shadow)
- Simplified Quick Actions in Progress tab (removed duplicate Book Lesson)

**New Student Form Simplification:**
- Removed progressive disclosure wizard - all essential fields visible upfront
- Reordered fields: Name → Contact (email + phone) → Date of Birth + Hours Required
- Optional sections now use collapsible `<details>` elements:
  - Home Address (used for pickup)
  - Parent/Guardian (with conditional phone requirement)
  - Learner's Permit & Notes
- Cleaner styling: gray-50 backgrounds, rounded-xl borders, consistent text-sm
- Removed excessive green validation feedback on every field
- Simplified action buttons (solid blue instead of gradients)
- Added "Book First Lesson" button after successful student creation

**Code Cleanup:**
- Removed unused imports: `CalendarIcon`, `CreditCard`, `StickyNote`, `Clock`
- Removed unused `handleChange` and `isValidEmail` functions
- Inline arrow functions used directly for form field onChange handlers

**Files Modified:**
- `frontend/src/components/students/StudentModal.tsx`

---

## [0.5.5] - 2026-01-29

### Added - Responsive Mobile Layout

**Responsive Sidebar with Hamburger Menu:**
- App is now fully usable on mobile devices and tablets
- Hamburger menu button appears in header on screens < 1024px
- Sidebar slides in from left with smooth animation
- Tap outside or X button to close sidebar
- Sidebar auto-closes when navigating to a new page
- Desktop experience unchanged (sidebar always visible)

**Mobile-Optimized Header:**
- Compact header height on mobile (56px vs 64px)
- User name/email hidden on mobile (icons only)
- Reduced spacing for better mobile layout

**Responsive Content Area:**
- Main content padding reduced on mobile (16px vs 24px)
- Better use of screen real estate on smaller devices

**Breakpoints:**
- `lg:` (1024px+) - Desktop: sidebar always visible
- `sm:` (640px+) - Tablet: slightly larger spacing
- Below 640px - Mobile: compact view

**Files Modified:**
- `frontend/src/components/layout/AppLayout.tsx` - Sidebar state, overlay backdrop
- `frontend/src/components/layout/Header.tsx` - Hamburger button, responsive styling
- `frontend/src/components/layout/Sidebar.tsx` - Mobile slide-in/out, close button

---

## [0.5.4] - 2026-01-29

### Added - Quick Win UX Improvements

**Calendar Day Hover Previews:**
- Hover over any day in the Calendar view to see a tooltip preview
- Shows lesson count by status (scheduled vs completed)
- Lists instructor names with lessons that day (up to 3)
- Shows available slot count
- 200ms delay to prevent flickering
- Smart positioning to stay within viewport

**Keyboard Shortcuts:**
- `←` / `→` - Navigate to previous/next month (Calendar) or week (Weekly)
- `T` - Jump to today
- `N` - Open new lesson booking modal
- `1` / `2` / `3` - Switch between Table, Month, and Weekly views
- `?` - Show keyboard shortcuts help modal
- `Esc` - Close modals
- New KeyboardShortcutsHelp modal with all available shortcuts
- Keyboard icon button in header to access shortcuts help

**Compare Instructors Mode (Weekly View):**
- New Single/Compare toggle in the Weekly view header
- Compare mode allows selecting 2-3 instructors simultaneously
- Color-coded instructor badges (blue, purple, emerald)
- Side-by-side weekly comparison grid showing:
  - Lesson counts per day per instructor
  - Scheduled vs completed breakdown
  - Today column highlighting
- Easy visual comparison of instructor workloads

**Files Added:**
- `frontend/src/components/common/KeyboardShortcutsHelp.tsx`

**Files Modified:**
- `frontend/src/pages/Lessons.tsx` - Keyboard shortcuts, refs, help modal
- `frontend/src/components/lessons/LessonsCalendarView.tsx` - Hover tooltips, forwardRef
- `frontend/src/components/scheduling/InstructorWeeklySchedule.tsx` - Compare mode, forwardRef
- `frontend/src/components/common/index.ts` - KeyboardShortcutsHelp export
- `frontend/src/components/lessons/index.ts` - LessonsCalendarViewRef type export

---

## [0.5.3] - 2026-01-29

### Added - Lessons Page Enhanced Filtering & Today's Schedule Widget

**Search & Filter in All Views:**
- Filter bar (status filters) now visible in Calendar and Weekly views (was table-only)
- Search highlighting in Calendar view: days with matching lessons show amber ring
- Search match count badge on calendar days
- Non-matching days dimmed when search is active
- DayDetailModal highlights lessons matching the search term

**Date Range Filter:**
- New DateRangeFilter component with preset buttons
- Presets: All Time, Today, This Week, This Month, Custom
- Custom date inputs appear when "Custom" is selected
- Works across all view modes (Table, Calendar, Weekly)

**Today's Schedule Widget:**
- New collapsible widget at top of Lessons page
- Shows today's lessons with quick stats (X done, Y remaining)
- Progress bar for completion tracking
- Current lesson highlight (blue, shows "Now")
- Next lesson highlight with countdown (e.g., "in 2h 30m")
- Quick action buttons: View details, Mark complete
- Collapse state persists to localStorage
- Shows "All done!" celebration when all lessons completed

**Files Added:**
- `frontend/src/components/common/DateRangeFilter.tsx`
- `frontend/src/components/lessons/TodaysScheduleWidget.tsx`

**Files Modified:**
- `frontend/src/pages/Lessons.tsx` - Integrated new components
- `frontend/src/components/lessons/LessonsCalendarView.tsx` - Search highlighting
- `frontend/src/components/lessons/DayDetailModal.tsx` - Search highlighting
- `frontend/src/components/common/index.ts` - New exports
- `frontend/src/components/lessons/index.ts` - New exports

---

## [0.5.2] - 2026-01-28

### Changed - Lessons Page Improvements

**Sorting & Filtering:**
- Lessons now sorted by start time within each date group (Today, Tomorrow, This Week, etc.)
- Past lessons sorted with most recent first for easier reference
- Added "Today" filter button to quickly see all of today's lessons (any status)
- "Today's Lessons" stat card now filters to today only (was filtering to all 'scheduled')

**User Feedback:**
- Added toast notifications for lesson status changes:
  - "Lesson cancelled successfully"
  - "Lesson marked as completed"
  - "Lesson marked as no-show"

**Code Cleanup:**
- Removed unused imports (CarIcon, Trash2, vehiclesApi)
- Removed unused code (getVehicleInfo, deleteMutation, handleDelete)
- Fixed colSpan from 7 to 8 in table group headers
- Updated pagination to show "X of Y lessons (filtered)"
- Fixed unused lessonId parameter (prefixed with underscore)

---

### Changed - Workflow-Based Student Status System

**Student Status Overhaul:**
- Replaced lifecycle-based statuses with workflow-based statuses
- Old: Enrolled → Active → Completed (lifecycle stages)
- New: Actionable workflow states for daily operations

**New Status Definitions:**
| Status | Meaning | Use Case |
|--------|---------|----------|
| **Scheduled** | Has upcoming lesson(s) | Active learners on calendar |
| **Ready to Book** | No upcoming lesson, not completed | Needs scheduling outreach |
| **Needs Attention** | Urgent issues (permit expired, no-shows, 14-60 day gaps) | Action items |
| **Completed** | Finished all required hours | Graduates |
| **Inactive** | Dropped, suspended, or 60+ days no activity | Archive |

**Filter Updates:**
- Students page now defaults to "All" filter
- Replaced "Enrolled" and "Active" filters with "Scheduled" and "Ready to Book"
- Added "Inactive" filter for archived students
- Color-coded badges: green (scheduled), blue (ready to book), amber (attention), purple (completed), gray (inactive)

**Stat Cards Updates:**
- Replaced old "Active Students" card with "Scheduled" and "Ready to Book" cards
- Now 5 stat cards: New This Month, Scheduled, Ready to Book, Needs Attention, Completed
- Updated grid layout from 4-column to 5-column on large screens
- "Completed" card now shows "+X this month" instead of avg progress percentage
- Each card is clickable to filter the student table
- "New This Month" card now filters to students enrolled this month (was showing all)

**Sorting Options:**
- Added sort dropdown to Students page filter bar
- Sort options: Name A-Z, Newest First, Oldest First, Longest Since Lesson, Closest to Done
- "Longest Since Lesson" prioritizes students who haven't had a lesson recently
- "Closest to Done" shows students nearest to completing their required hours

**Card View Improvements:**
- Status reason now visible below status badge in card view
- Shows context like "Next lesson: 1/30/2026" or "Enrolled 10 days ago, no lessons booked"
- Matches tooltip info shown on hover in table view

**Pagination Improvements:**
- Now shows total student count: "X of Y students"
- Indicates when results are filtered: "(filtered)"
- Updated styling to match other UI elements

**Dashboard Updates:**
- "Active Students" stat now counts "Scheduled" + "Ready to Book" students
- Represents students actively in the training pipeline

---

## [0.5.1] - 2026-01-27

### Added - UX Improvements & Age-Based Training Hours

**Student Management:**
- Age-based training hours auto-detection in StudentModal
  - Under 18: Defaults to 6 hours (CA requirement from settings)
  - 18 and over: Defaults to 2 hours (adult learners)
  - Shows hint badge: "Adult (25y) - 2hr default" or "Under 18 (16y) - 6hr required (CA)"
  - Admin can still manually adjust hours as needed
- Added Training Hours Required section to StudentModal form
- Added Clock icon import for training hours UI

**Lesson Booking:**
- Removed "Proceed Anyway" conflict bypass dialog in LessonModal
- Submit button now disabled when time conflict exists
- Cleaner UX: users must select a non-conflicting time to proceed
- Conflict warning still displays inline with next available slot suggestion

**Dashboard & Navigation:**
- Fixed "Needs Attention" navigation from Dashboard to Students page
- Changed filter parameter from `needsAttention` (camelCase) to `needs_attention` (snake_case)
- Added auto-scroll to student table after filter is applied

**Students Page:**
- Removed separate "Attention Reason" column from table
- Status badge now shows reason on hover (tooltip)
- Added `cursor-help` class to indicate hoverable status badges
- Simplified table to 6 columns (was conditionally 7)

### Fixed
- Dashboard → Students "Needs Attention" stat card now correctly filters students
- LessonModal no longer allows bypassing conflict detection
- Students table colspan values updated for consistent layout
- StudentModal submit button now checks firstName/lastName instead of fullName
- Fixed SQL parameter order in createStudent (license_type was in wrong position)
- Fixed emergency_contact NOT NULL constraint (now defaults to empty string)

### Changed
- StudentModal sections renumbered (Section 7: Training Hours, Section 8: Permit & Notes)

### Removed
- Removed `license_type` field from entire codebase (migration 038)
  - No longer needed as we only teach car driving
  - Removed from database schema (made nullable, deprecated)
  - Removed from backend studentService (createStudent, updateStudent)
  - Removed from frontend types (Student, CreateStudentInput)
  - Removed from StudentModal form

---

## [0.5.0] - 2025-12-09

### Added - Lesson Number Tracking & Calendar Improvements

**Lesson Number Feature:**
- Added `lesson_number` column to lessons table (migration 025)
- LessonModal now includes lesson number dropdown (#1, #2, #3, etc.)
- Auto-suggests next lesson number based on student's previous lessons
- Shows "of ~X" estimated total based on student's hours required
- Lesson number displayed in ICS calendar events and email invites

**Instructor Availability Improvements:**
- Added `max_students` column to instructor_availability (migration 024)
- AvailabilityEditor now has Max Students dropdown (1-5 or Default)
- AvailabilityCalendar shows actual bookable slots (not raw availability)
- Calendar view starts at 7 AM instead of midnight

**Student Management Fixes:**
- Fixed "Internal server error" when editing students (empty string date handling)
- Added `hoursRequired` and `licenseType` to updateStudent function
- Empty date strings now properly converted to NULL for PostgreSQL

**UI/UX Consistency:**
- Instructors page and modal now match Students/Lessons styling
- Purple gradient icon headers for instructor sections
- Stats cards with filter dropdowns
- Removed unused notes section from InstructorModal

### Removed - Code Cleanup

**Dead Code Removal:**
- Removed `googleCalendarAuth.ts` - Unused OAuth implementation
- Removed `googleCalendarSync.ts` - Unused sync service
- Removed `calendarRoutes.ts` - Unused API routes

**Calendar Architecture Simplified:**
- Now using only ICS feeds (universal calendar subscription)
- Works with Google Calendar, Apple Calendar, Outlook, any ICS app
- No OAuth complexity - simple URL subscription

---

## [0.4.1] - 2025-11-08

### Added - Phase 4A Frontend: Smart Scheduling UI

**React Components:**
- `AvailabilityCalendar.tsx` (172 lines) - Visual week view grid
- `AvailabilityEditor.tsx` (267 lines) - CRUD for instructor schedules
- `TimeOffManager.tsx` (305 lines) - Time off request/approval workflow
- `SmartBookingForm.tsx` (432 lines) - 3-step booking wizard with conflict detection
- `Scheduling.tsx` (180 lines) - Main admin page with tabbed interface

**API Integration:**
- `scheduling.ts` (186 lines) - Complete API client for 17 scheduling endpoints
- Full TypeScript type definitions (95 lines)
- Error handling and loading states

**Features:**
- Visual weekly availability calendar with color coding
- Drag-free slot management (add/edit/delete availability)
- Time off request submission and approval workflow
- Smart slot finding with date range picker
- Real-time conflict detection (6 dimensions)
- Multi-step booking wizard with validation
- Responsive Tailwind CSS design

**Navigation:**
- Added `/scheduling` route to App.tsx
- Added "Scheduling" link to sidebar navigation
- Tabbed interface (Availability, Time Off, Smart Booking)

**Documentation:**
- Created `PHASE_4A_FRONTEND.md` - Comprehensive frontend guide
- Created `BLOCKCHAIN_ROADMAP.md` - Phase 6 BSV blockchain planning

**Total Frontend Code:** ~1,637 lines of production TypeScript/React

---

## [0.4.0] - 2025-11-08

### Added - Phase 4A: Smart Scheduling Foundation

**Database:**
- New table: `instructor_availability` for recurring weekly schedules
- New table: `instructor_time_off` for vacations and unavailability
- New table: `scheduling_settings` for tenant-specific configuration
- New table: `notification_queue` for scheduled lesson reminders
- Added vehicle ownership tracking (`instructor_id`, `ownership_type` to vehicles)
- Added instructor vehicle preferences (`prefers_own_vehicle`, `default_vehicle_id`)
- Added lesson buffer time tracking (`buffer_time_after` to lessons)
- 12 new database indexes for query optimization

**Backend Services:**
- `availabilityService.ts` (449 lines) - CRUD for availability and time off
- `schedulingService.ts` (417 lines) - Smart scheduling algorithms
- Intelligent slot finding with gap detection
- 6-dimensional conflict detection:
  - instructor_busy
  - vehicle_busy
  - student_busy
  - outside_working_hours
  - time_off
  - buffer_violation
- Booking validation service

**API Endpoints:**
- 17 new scheduling endpoints:
  - Instructor availability management (6 endpoints)
  - Time off management (4 endpoints)
  - Scheduling settings (2 endpoints)
  - Smart scheduling (3 endpoints: find-slots, check-conflicts, validate-booking)
  - Get all instructors availability (1 endpoint)
  - Time off filtering (1 endpoint)

**TypeScript Types:**
- `InstructorAvailability` interface
- `InstructorTimeOff` interface
- `SchedulingSettings` interface
- `NotificationQueue` interface
- `TimeSlot` interface
- `SchedulingConflict` interface
- `AvailabilityRequest` interface

**Documentation:**
- Created `DEVELOPMENT_LOG.md` (1000+ lines) - Complete project history
- Created `PHASE_4A_SUMMARY.md` - Phase 4A technical documentation
- Updated environment variable documentation

**Features:**
- 30-minute default buffer time between lessons
- Configurable scheduling settings per tenant
- Support for instructor-owned vs school-owned vehicles
- Automatic conflict prevention
- Time-based slot finding across date ranges

### Fixed
- TypeScript compilation errors in schedulingService.ts
- Missing tenant_id column in instructor_availability table
- Import path error in availabilityRoutes.ts
- Type mismatch for vehicleForLesson (undefined vs null)
- Unused imports and variables

### Changed
- Updated `.env.example` to remove blockchain/MongoDB references
- Streamlined environment configuration
- Added Google Calendar placeholders for Phase 4B

---

## [0.3.0] - 2025-11-XX

### Added - Phase 3: Frontend Application

**Components:**
- React admin dashboard with Tailwind CSS
- Student management pages (list, create, edit, view)
- Instructor management interface
- Vehicle management interface
- Lesson scheduling interface
- Payment tracking interface
- Settings page

**Features:**
- Multi-page routing with React Router
- API integration layer
- Tenant context provider
- Form validation
- Table pagination
- Modal dialogs

**Development:**
- Vite build configuration
- Tailwind CSS setup
- Component library structure

---

## [0.2.0] - 2025-11-XX

### Added - Phase 2: Backend API

**Core Backend:**
- Express.js REST API with TypeScript
- JWT authentication system
- Multi-tenant context middleware
- Input validation and sanitization
- Centralized error handling
- PostgreSQL connection pooling

**Services:**
- `tenantService.ts` - Tenant management
- `studentService.ts` - Student CRUD operations
- `instructorService.ts` - Instructor management
- `vehicleService.ts` - Vehicle fleet management
- `lessonService.ts` - Lesson scheduling
- `paymentService.ts` - Payment tracking

**API Routes:**
- ~45 RESTful endpoints across 6 resource types
- Authentication endpoints (login, register, me)
- CRUD operations for all entities
- Pagination support
- Status updates for lessons

**Middleware:**
- `authenticate` - JWT token validation
- `requireTenantContext` - Multi-tenant isolation
- `validate` - Input validation and sanitization
- `errorHandler` - Centralized error handling

---

## [0.1.0] - 2025-11-XX

### Added - Phase 1: Database Foundation

**Database Schema:**
- Created 8 core tables:
  - `tenants` - Multi-tenant organizations
  - `users` - Admin users with authentication
  - `students` - Student profiles
  - `instructors` - Instructor profiles
  - `vehicles` - Vehicle fleet
  - `lessons` - Lesson scheduling
  - `payments` - Payment transactions
  - `lesson_packages` - Pre-paid lesson bundles

**Database Features:**
- UUID primary keys for all tables
- Multi-tenant architecture with tenant_id isolation
- Foreign key constraints for referential integrity
- Indexes for query optimization
- Auto-updating timestamps (created_at, updated_at)
- Soft deletes where appropriate
- PostgreSQL-specific features (gen_random_uuid, triggers)

**Migration System:**
- `setup-db.js` - Database initialization
- `run-migration.js` - Migration runner
- `001_complete_schema.sql` - Initial schema migration

---

## Roadmap

### [0.5.0] - Phase 4A Frontend (In Progress)
- Calendar week view component
- Availability editor UI
- Time off management interface
- Smart booking form with slot picker
- Drag-and-drop scheduling

### [0.6.0] - Phase 4B: Google Calendar Integration
- OAuth 2.0 authentication flow
- Two-way calendar sync
- Webhook for real-time updates
- External event conflict detection
- Calendar preferences per instructor

### [0.7.0] - Phase 4C: Recurring Lessons
- Recurring lesson pattern tables
- Pattern generation logic
- Package lesson linking
- Bulk lesson creation
- Exception handling for patterns

### [0.8.0] - Phase 5: Student Portal
- Student authentication
- Self-booking interface
- Lesson history view
- Payment history
- Package balance tracking

### [0.9.0] - Phase 6: Notifications & Reporting
- Email notification system
- SMS notifications (Twilio)
- Instructor utilization reports
- Revenue analytics
- Student progress tracking

### [1.0.0] - Production Release
- Security audit
- Performance optimization
- Load testing
- Production deployment
- User documentation
- Admin training materials

---

## Version History Summary

| Version | Phase | Status | Date | Key Feature |
|---------|-------|--------|------|-------------|
| 0.5.1 | 4A | ✅ Complete | 2026-01-27 | Age-Based Training Hours & UX Fixes |
| 0.5.0 | 4A | ✅ Complete | 2025-12-09 | Lesson Tracking & Calendar Improvements |
| 0.4.0 | 4A | ✅ Complete | 2025-11-08 | Smart Scheduling Foundation |
| 0.3.0 | 3 | ✅ Complete | 2025-11-XX | Frontend Application |
| 0.2.0 | 2 | ✅ Complete | 2025-11-XX | Backend API |
| 0.1.0 | 1 | ✅ Complete | 2025-11-XX | Database Foundation |

---

## Notes

- All dates use YYYY-MM-DD format
- Breaking changes are noted with ⚠️
- Security fixes are noted with 🔒
- Performance improvements are noted with ⚡

For detailed technical implementation notes, see [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).
For Phase 4A specifics, see [PHASE_4A_SUMMARY.md](PHASE_4A_SUMMARY.md).

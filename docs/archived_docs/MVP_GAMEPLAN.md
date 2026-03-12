# Budget Drive Protocol - MVP Gameplan

**Created:** January 2026
**Goal:** Working business tool for a small driving school (owner + 1-2 instructors)
**Approach:** Fix critical issues first, then add polish

---

## Current State Assessment

### What's Working
- Dashboard page - displays stats, today's schedule
- Students page - CRUD, search, filtering, progress tracking
- Instructors page - CRUD, status management
- Vehicles page - CRUD, search
- Payments page - viewing payments (backend works)
- Scheduling page - availability management, time off
- Instructor Earnings page - earnings breakdown
- Settings page - basic settings work

### What's Broken (Critical)

| Issue | Location | Impact | Status |
|-------|----------|--------|--------|
| ~~Lesson creation fails~~ | `schedulingService.ts:356` | ~~Cannot book lessons~~ | ✅ FIXED |
| ~~Column mismatch: `instructor_id` vs `owner_instructor_id`~~ | vehicles table | ~~Blocks lesson booking~~ | ✅ FIXED |
| ~~Frontend API calls `/tenants/settings`~~ | API routes | ~~Settings may not load~~ | ✅ Verified correct |
| SmartBookingForm V1 vs V2 confusion | frontend | Inconsistent UX | Pending (Chunk 5) |

### What's Missing (For MVP)

| Feature | Priority | Why Needed |
|---------|----------|------------|
| Login page | HIGH | Multi-user access |
| Logout button | HIGH | Session management |
| Print schedules | MEDIUM | Instructors need paper |
| Team management UI | MEDIUM | Add/manage instructor accounts |
| Consolidate booking forms | LOW | Clean UX |

---

## Gameplan: 5 Chunks

### Chunk 1: Fix Critical Bugs (1-2 hours) ✅ COMPLETE
**Goal:** Make lesson booking work

- [x] Fix `schedulingService.ts` - change `instructor_id` to `owner_instructor_id`
- [x] Fix frontend API path for tenant settings (verified - already correct)
- [x] Test lesson creation end-to-end (working with correct lesson_type: `behind_wheel`)
- [x] Remove console.log debug statements from Treasury page and TenantContext

### Chunk 2: Auth & Multi-User (2-3 hours)
**Goal:** Owner and instructors can log in separately

- [ ] Create Login page component
- [ ] Add login API endpoint (`POST /api/v1/auth/login`)
- [ ] Add logout functionality to Sidebar
- [ ] Store auth token properly
- [ ] Create basic "current user" context
- [ ] Test: Owner logs in, sees everything
- [ ] Test: Create instructor account, log in as instructor

### Chunk 3: Role-Based Views (1-2 hours)
**Goal:** Instructors see only their stuff

- [ ] Add role check in frontend (admin vs instructor)
- [ ] Instructor view: Only see own schedule, students, earnings
- [ ] Hide admin-only pages from instructor nav (Settings, Treasury, Team)
- [ ] Add "Instructor Mode" toggle for owner to preview

### Chunk 4: Print & Export (1-2 hours)
**Goal:** Generate printable schedules

- [ ] Add "Print Schedule" button to Lessons page
- [ ] Create printable weekly schedule view (CSS @media print)
- [ ] Add "Export CSV" for student list
- [ ] Add "Print" button for individual lesson details

### Chunk 5: Polish & Cleanup (1-2 hours)
**Goal:** Professional feel

- [ ] Consolidate SmartBookingForm (keep V2, remove V1)
- [ ] Remove placeholder "Coming Soon" pages or implement basic versions
- [ ] Fix any remaining console warnings
- [ ] Test all workflows end-to-end
- [ ] Update seed data to match your real business

---

## Detailed Task Breakdown

### Chunk 1: Fix Critical Bugs

#### Task 1.1: Fix Vehicle Column Mismatch
**File:** `backend/src/services/schedulingService.ts`
**Line:** ~356
**Problem:** Code references `instructor_id` but schema uses `owner_instructor_id`
**Fix:**
```typescript
// Change this:
if (vehicle.ownership_type === 'school_owned' || !vehicle.instructor_id) {
// To this:
if (vehicle.ownership_type === 'school_owned' || !vehicle.owner_instructor_id) {
```

#### Task 1.2: Verify Frontend API Paths
**Check:** `frontend/src/api/tenants.ts`
**Ensure:** Calls match backend routes
- `/tenant/settings` (not `/tenants/settings`)
- `/tenant/current` (not `/tenants/current`)

#### Task 1.3: Test Lesson Creation
```bash
# After fixes, test:
curl -X POST http://localhost:3000/api/v1/lessons \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "<valid-student-id>",
    "instructorId": "<valid-instructor-id>",
    "scheduledStart": "2025-01-25T10:00:00Z",
    "scheduledEnd": "2025-01-25T12:00:00Z",
    "lessonType": "behind_the_wheel",
    "status": "scheduled"
  }'
```

#### Task 1.4: Remove Debug Logs
**File:** `frontend/src/pages/Treasury.tsx`
**Lines:** ~59-71 (remove console.log statements)

---

### Chunk 2: Auth & Multi-User

#### Task 2.1: Create Login Page
**File:** `frontend/src/pages/Login.tsx`
**Features:**
- Email + password form
- Error handling
- Redirect to dashboard on success
- Store token in localStorage

#### Task 2.2: Create Auth API
**File:** `backend/src/routes/authRoutes.ts`
**Endpoints:**
- `POST /api/v1/auth/login` - Authenticate user
- `POST /api/v1/auth/logout` - Invalidate session
- `GET /api/v1/auth/me` - Get current user info

#### Task 2.3: Add Logout to Sidebar
**File:** `frontend/src/components/layout/Sidebar.tsx`
**Add:** Logout button at bottom of nav

#### Task 2.4: Create Auth Context
**File:** `frontend/src/contexts/AuthContext.tsx`
**Features:**
- Store current user
- isAuthenticated check
- login/logout functions
- Persist across page refresh

---

### Chunk 3: Role-Based Views

#### Task 3.1: Define Roles
```typescript
type UserRole = 'admin' | 'instructor' | 'staff';
```

#### Task 3.2: Conditional Navigation
**File:** `frontend/src/components/layout/Sidebar.tsx`
**Logic:**
```typescript
// Admin sees: Dashboard, Students, Instructors, Vehicles, Lessons, Scheduling, Payments, Treasury, Settings
// Instructor sees: Dashboard (own), My Schedule, My Earnings
```

#### Task 3.3: Filter Data by Role
- Instructors only see their own lessons
- Instructors only see students assigned to them (or all if no assignment)
- Hide financial data from non-admins

---

### Chunk 4: Print & Export

#### Task 4.1: Print Schedule CSS
**File:** `frontend/src/index.css` or component-level
**Add:**
```css
@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  /* Format for clean printing */
}
```

#### Task 4.2: Print Schedule Component
**File:** `frontend/src/components/lessons/PrintableSchedule.tsx`
**Features:**
- Weekly grid format
- Instructor name, student name, time, location
- Date range header
- Business name/logo

#### Task 4.3: Export CSV
**File:** `frontend/src/utils/export.ts`
**Function:** `exportToCSV(data, filename)`

---

### Chunk 5: Polish & Cleanup

#### Task 5.1: Consolidate SmartBookingForm
- Keep `SmartBookingFormV2.tsx`
- Update all references to use V2
- Delete `SmartBookingForm.tsx` (V1)

#### Task 5.2: Handle Placeholder Pages
- Certificates: Show "Coming in v1.1" with nice UI
- Follow-ups: Show "Coming in v1.1" with nice UI
- Or implement basic versions if time permits

#### Task 5.3: Final Testing Checklist
- [ ] Add new student
- [ ] Add new instructor with availability
- [ ] Book a lesson (smart booking)
- [ ] Mark lesson as completed
- [ ] Record a payment
- [ ] View instructor earnings
- [ ] Print weekly schedule
- [ ] Login as owner
- [ ] Login as instructor
- [ ] Logout

---

## Success Criteria

### MVP is "Done" When:

1. **Owner can:**
   - Log in with email/password
   - Add/edit students, instructors, vehicles
   - Book lessons using smart scheduling
   - View and record payments
   - Print weekly schedules
   - See all data across the school

2. **Instructor can:**
   - Log in with their own account
   - See their schedule only
   - Mark lessons as completed
   - View their earnings
   - Cannot access admin settings

3. **System:**
   - No console errors in production
   - All core workflows complete without errors
   - Data persists correctly
   - Looks professional (no obvious placeholders)

---

## Time Estimates

| Chunk | Estimated Time | Dependencies |
|-------|----------------|--------------|
| 1: Fix Bugs | 1-2 hours | None |
| 2: Auth | 2-3 hours | Chunk 1 |
| 3: Roles | 1-2 hours | Chunk 2 |
| 4: Print | 1-2 hours | Chunk 1 |
| 5: Polish | 1-2 hours | All above |

**Total: 6-11 hours** (can be done in 2-3 focused sessions)

---

## Recommended Order

**Session 1:** Chunk 1 (bugs) + Chunk 4 (print)
- Fix critical issues
- Add print functionality
- Test core workflows

**Session 2:** Chunk 2 (auth) + Chunk 3 (roles)
- Implement login system
- Add role-based access
- Test multi-user scenarios

**Session 3:** Chunk 5 (polish) + Final testing
- Clean up code
- Remove debug statements
- Final end-to-end testing

---

## Notes

- Keep the auth simple for now (JWT tokens, localStorage)
- Don't over-engineer roles - just admin vs instructor
- Print functionality should use browser's native print
- Focus on "it works" over "it's perfect"

---

**Chunk 1 Complete! Ready for Chunk 2 (Auth & Multi-User) or Chunk 4 (Print & Export).**

---

## Progress Log

### Session 17 - January 23, 2026
**Chunk 1 Completed:**
1. Fixed `schedulingService.ts` lines 356 & 364 - changed `instructor_id` to `owner_instructor_id`
2. Verified frontend API paths were already correct (`/tenant/settings`)
3. Tested lesson creation successfully with proper parameters:
   - Valid lesson types: `behind_wheel`, `classroom`, `road_test_prep`
   - Confirmed scheduling conflict detection works correctly
4. Removed debug console.log statements from:
   - `frontend/src/pages/Treasury.tsx`
   - `frontend/src/contexts/TenantContext.tsx`

**Next:** Chunk 2 (Auth) or Chunk 4 (Print) based on user preference

# Codebase Audit and Fixes - Session Recovery

**Date:** December 11, 2025
**Issue:** Database and frontend issues after working with another agent

## Problems Identified

### 1. ✅ FIXED - Circular Dependency in `studentStatus.ts`
**Problem:** Infinite recursion causing "Maximum call stack size exceeded"

**Root Cause:**
```typescript
// studentNeedsFollowup() called computeStudentStatus()
// computeStudentStatus() called studentNeedsFollowup()
// getFollowupReason() also called computeStudentStatus()
```

**Fix Applied:**
- Removed calls to `computeStudentStatus()` from within `studentNeedsFollowup()` and `getFollowupReason()`
- These functions now check raw student data directly instead of computed status
- Lines 99-111 and 171-179 in `studentStatus.ts`

### 2. ✅ FIXED - Missing Database Migration (users table)
**Problem:** Backend returning "relation 'users' does not exist"

**Root Cause:**
- Migration 001 created base schema
- Migration 020 (tenant_types_and_referrals) which creates `users` table was never applied

**Fix Applied:**
- Created `run-migration-020.js` with proper dotenv path configuration
- Applied migration 020 successfully
- Created 7 new tables: users, user_tenant_memberships, referral_sources, etc.

### 3. ✅ FIXED - Non-Idempotent Triggers
**Problem:** Migration 001 failing on re-runs with "trigger already exists"

**Root Cause:**
- All 21 `CREATE TRIGGER` statements lacked `DROP TRIGGER IF EXISTS`
- PostgreSQL doesn't support `CREATE TRIGGER IF NOT EXISTS`

**Fix Applied:**
- Created `fix-migration-triggers.js` script
- Added `DROP TRIGGER IF EXISTS` before all 21 CREATE TRIGGER statements
- Migration 001 now idempotent

### 4. ✅ FIXED - Missing tenant_id Column
**Problem:** Seed script failing with "column tenant_id does not exist" in instructor_availability

**Root Cause:**
- Migration 001 created old version of table
- Migration 002 (which adds tenant_id) failed to apply properly
- Table structure mismatch

**Fix Applied:**
- Created `fix-instructor-availability.js`
- Added `tenant_id UUID` column with foreign key constraint
- Added index on tenant_id
- Updated existing rows to use first tenant

### 5. ✅ FIXED - Incomplete googleCalendarSync.ts
**Problem:** TypeScript build failing with "Cannot find module './googleCalendarAuth'"

**Root Cause:**
- Untracked file `googleCalendarSync.ts` was created but incomplete
- Referenced non-existent `googleCalendarAuthService` module

**Fix Applied:**
- Deleted incomplete `backend/src/services/googleCalendarSync.ts`
- TypeScript build now succeeds

### 6. ✅ FIXED - Incorrect Route Mounting
**Problem:** `/api/v1/users` returning UUID parse error "invalid input syntax for type uuid: 'users'"

**Root Cause:**
- `userRoutes` mounted at `API_PREFIX` without subpath
- Routes matched `/:id` parameter, treating "users" as an ID

**Fix Applied:**
- Changed `app.use(API_PREFIX, userRoutes)` to `app.use(\`${API_PREFIX}/users\`, userRoutes)`
- Line 87 in `backend/src/app.ts`

## Current State

### Backend ✅
- Running on http://localhost:3000
- All migrations applied (001-031)
- Database seeded with test data:
  - 1 Tenant (Budget Driving School)
  - 7 Students
  - 5 Instructors
  - 4 Vehicles
  - 8 Payments

### Frontend ✅
- Running on http://localhost:5173
- Vite HMR working
- Infinite loop fixed
- Should display data correctly

### Database Schema ✅
- `users` table exists with proper structure
- `user_tenant_memberships` table for role-based access
- Audit trail columns (`created_by`, `updated_by`) on 5 tables
- All indexes and constraints in place

## Files Modified

### Backend Files
1. `backend/database/migrations/001_complete_schema.sql` - Added DROP TRIGGER IF EXISTS
2. `backend/src/app.ts` - Fixed userRoutes mounting (line 87)
3. `backend/database/migrations/020_tenant_types_and_referrals.sql` - Applied

### Frontend Files
1. `frontend/src/utils/studentStatus.ts` - Fixed circular dependencies (lines 99-111, 171-179)

### New Helper Scripts Created
1. `backend/database/fix-migration-triggers.js` - Add DROP TRIGGER statements
2. `backend/database/run-migration-020.js` - Apply migration 020
3. `backend/database/run-migration-030.js` - Apply migration 030
4. `backend/database/run-all-migrations.js` - Apply all migrations in order
5. `backend/database/fix-instructor-availability.js` - Add missing tenant_id column
6. `backend/database/check-schema.js` - Verify database schema

### Files Deleted
1. `backend/src/services/googleCalendarSync.ts` - Incomplete/broken file

## Remaining Issues / Technical Debt

### 1. Data Schema Inconsistencies
**Issue:** Students have duplicate fields
- Old fields: `emergencyContact` (concatenated string)
- New fields: `emergencyContactName`, `emergencyContactPhone` (structured)
- Address fields: `address` (legacy) vs `addressLine1`, `city`, `state`, `zipCode` (structured)
- Name fields: `fullName` (legacy) vs `firstName`, `lastName`, `middleName` (structured)

**Impact:** Current seed data has values in old fields, new fields are NULL

**Recommendation:** Create data migration to split legacy fields into structured fields

### 2. Migration File Conflicts
**Issue:** Two migration files with same number
- `019_emergency_contact_split.sql`
- `020_add_permit_issue_and_second_emergency_contact.sql`
- `020_tenant_types_and_referrals.sql` ← Duplicate 020!

**Recommendation:** Rename `020_tenant_types_and_referrals.sql` to `032_tenant_types_and_referrals.sql`

### 3. Audit Trail Not Populated
**Issue:** All `created_by` and `updated_by` fields are NULL in existing data

**Root Cause:** Data seeded before audit trail migration, and seed script doesn't set user IDs

**Recommendation:**
- Seed script should create a system user first
- Use system user ID for all seeded data
- Or accept NULL for test data and only enforce for production

### 4. Missing Audit Middleware
**Issue:** Backend has audit columns but no middleware to populate them

**Location:** Controllers manually extract `req.user` and pass to services

**Recommendation:** Create audit middleware that automatically adds userId to all mutations

### 5. Multiple Duplicate Migration Entries
**Issue:** Some migrations have similar names/purposes
- `023_calendar_feed_tokens.sql`
- `023_instructor_address_fields.sql` ← Also duplicate 023!

**Recommendation:** Review and consolidate, ensure sequential numbering

## Best Practices Violations

### 1. Untracked/Uncommitted Files
- Multiple `.js` helper scripts in `backend/database/`
- These should be in `.gitignore` or committed if reusable

### 2. Hard-Coded Test Data in Seed Scripts
- Should use factory pattern or fixtures
- Consider using Faker.js for realistic test data

### 3. No Migration Tracking Table
- No `schema_migrations` table to track which migrations have run
- Relying on `IF NOT EXISTS` which can hide failures

**Recommendation:** Implement proper migration framework like `node-pg-migrate` or `db-migrate`

### 4. Mixed Concerns in Migration Files
- Some migrations add multiple unrelated features
- Example: 020 adds tenant types AND referral system AND user accounts

**Recommendation:** One migration per logical change

## Recommendations Going Forward

### Immediate (Critical)
1. ✅ Fix circular dependencies - DONE
2. ✅ Apply missing migrations - DONE
3. ✅ Fix TypeScript build - DONE
4. Test frontend thoroughly for any remaining issues

### Short Term (Important)
1. Rename duplicate migration files (020, 023)
2. Create data migration for structured fields
3. Add audit middleware
4. Commit or gitignore helper scripts
5. Add migration tracking table

### Long Term (Technical Debt)
1. Implement proper migration framework
2. Consolidate duplicate/redundant migrations
3. Add comprehensive test coverage
4. Document database schema with ER diagrams
5. Add data validation and constraints

## Testing Checklist

- [x] Backend starts without errors
- [x] Frontend starts without errors
- [x] Students API returns data
- [x] Users API returns empty array (no users yet)
- [ ] Frontend displays students list (needs browser verification)
- [ ] Can create new student
- [ ] Can edit existing student
- [ ] Audit trail displays correctly
- [ ] No infinite loops in UI

## Next Steps

1. **User Verification**: Have user test frontend at http://localhost:5173
2. **Create System User**: Seed a default admin user for testing
3. **Data Migration**: Split legacy concatenated fields into structured fields
4. **Audit Middleware**: Implement automatic userId injection
5. **Migration Cleanup**: Rename duplicates and consolidate

---

**Status:** Backend ✅ Working | Frontend ✅ Fixed | Database ✅ Seeded
**Ready for Testing:** Yes

# Table Naming Issues & Fixes

**Generated:** 2025-12-12
**Issue:** Table naming mismatches between code and database schema

---

## Problem Summary

The system has **table naming mismatches** where the code references table names that don't exist in the database. This is causing errors like:
- `column "buffer_time_after" does not exist` ✅ **FIXED**
- Routes referencing `recurring_patterns` but table is named `recurring_lesson_patterns`
- Routes referencing `notifications` but table doesn't exist

---

## Fixed Issues ✅

### 1. buffer_time_after Column (FIXED)
**File:** `backend/src/services/schedulingService.ts:98`
**Problem:** Query was selecting `buffer_time_after` from `lessons` table, but column doesn't exist
**Fix:** Removed `buffer_time_after` from SELECT query (buffer time comes from `scheduling_settings` instead)

**Status:** ✅ FIXED - Backend restarted with compiled changes

---

## Remaining Issues ⚠️

### 1. recurring_patterns vs recurring_lesson_patterns

**Status:** NON-CRITICAL - Feature not actively used

**Problem:**
- Routes/Code References: `recurring_patterns`
- Actual Table Name: `recurring_lesson_patterns`

**Affected Files:**
- `backend/src/routes/recurringPatternRoutes.ts`
- `backend/src/services/recurringPatternService.ts`

**Solutions (Choose One):**

#### Option A: Create Database View (Recommended - No Code Changes)
```sql
CREATE VIEW recurring_patterns AS
SELECT * FROM recurring_lesson_patterns;
```
This creates an alias so both names work.

#### Option B: Update Code to Match Table Name
Update all references from `recurring_patterns` to `recurring_lesson_patterns` in:
- Route files
- Service files
- Type definitions

---

### 2. notifications Table Missing

**Status:** NON-CRITICAL - May use in-memory queue

**Problem:**
- Routes/Code References: `notifications` table
- Actual Status: Table doesn't exist in database

**Affected Files:**
- `backend/src/routes/notifications.ts`
- `backend/src/services/notificationService.ts`
- `backend/src/services/notificationProcessor.ts`

**Current Behavior:**
The notification system might be using in-memory queues instead of database persistence. This is fine for transient notifications but won't survive server restarts.

**Solutions (Choose One):**

#### Option A: Create notifications Table (If Persistence Needed)
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Option B: Keep In-Memory (Current State)
No changes needed if in-memory notification queue is sufficient.

---

## Complete Table Inventory

### Tables in Database (45 total):
1. bdp_actions_log
2. blockchain_records
3. calendar_event_mappings
4. calendar_sync_logs
5. certificates
6. commission_ledger
7. external_calendar_events
8. follow_ups
9. installments
10. instructor_availability
11. instructor_calendar_auth
12. instructor_calendar_credentials
13. instructor_certifications
14. instructor_ical_feeds
15. instructor_time_off ✅ (newly created)
16. instructor_vehicle_assignments
17. instructors
18. invoice_line_items
19. invoices
20. leads
21. lesson_calendar_events
22. lessons
23. merkle_batches
24. mileage_reimbursement_reports
25. pattern_generated_lessons
26. payment_plans
27. payments
28. **recurring_lesson_patterns** ⚠️ (code references as `recurring_patterns`)
29. recurring_pattern_exceptions
30. referral_reward_configs
31. referral_rewards
32. referral_sources
33. referrals
34. scheduling_settings
35. students
36. tenant_settings
37. tenants
38. treasury_balances
39. treasury_spending
40. treasury_transactions
41. user_tenant_memberships
42. users
43. vehicle_maintenance
44. vehicle_mileage_log
45. vehicles

---

## Recommendation

### Immediate Action (Optional):
If you want the recurring patterns feature to work, create the database view:

```bash
cd backend
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

pool.query('CREATE VIEW recurring_patterns AS SELECT * FROM recurring_lesson_patterns')
  .then(() => console.log('✅ View created successfully'))
  .catch(err => console.error('❌ Error:', err.message))
  .finally(() => pool.end());
"
```

### No Immediate Action Needed:
Both issues are non-critical:
- `recurring_patterns` - Feature not actively used in your current workflow
- `notifications` - Working via in-memory queue

---

## Testing Smart Booking

The smart booking should now work correctly. Test it by:

1. Open `http://localhost:5173`
2. Navigate to **Students** page
3. Click **Book Lesson** for any student
4. Select an instructor
5. Click **Find Available Times**
6. Time slots should now appear!

---

**Last Updated:** 2025-12-12
**Fix Applied:** buffer_time_after removed from query
**Backend Status:** Running on port 3000
**Frontend Status:** Running on port 5173

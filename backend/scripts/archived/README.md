# Archived Scripts

**Archived:** January 2026
**Reason:** One-time utility scripts no longer needed

These scripts were used for specific debugging, fixing, or testing tasks during development. They are kept for reference but should not be run again.

---

## Archived Scripts

### Database Fix Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| check-columns.js | Check column existence | Issue resolved |
| check-table-mismatches.js | Find table naming issues | Issue resolved |
| fix-buffer-column.js | Add buffer_time column | Migration applied |
| fix-buffer.ts | TypeScript version of above | Migration applied |

### System Check Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| comprehensive-system-check.js | Full system diagnostic | Point-in-time check |

### One-Time Setup Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| create-time-off-table.js | Create instructor_time_off table | Migration 035 applied |
| run-audit-migration.js | Run audit trail migration | Migration 030 applied |

### Test Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| test-audit-trail.js | Test audit trail functionality | Feature tested |
| test-calendar-feed.js | Test ICS calendar feeds | Feature tested |
| test-smart-booking.js | Test smart booking | Feature tested |
| fix-smart-booking.js | Fix smart booking issues | Issues resolved |

---

## Current Scripts

For current database operations, use:

- `backend/database/run-migration.js` - Run a specific migration
- `backend/database/run-all-migrations.js` - Run all pending migrations
- `backend/database/run-seed.js` - Seed test data
- `backend/database/setup-db.js` - Initial database setup

---

## Note

Do not run these archived scripts. They may reference old table structures or contain hardcoded values that are no longer valid.

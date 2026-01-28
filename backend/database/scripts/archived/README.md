# Archived Database Scripts

**Archived:** January 2026
**Reason:** One-time fix scripts, migrations already applied

These scripts were used to fix database issues during development. The fixes have been applied and the scripts are kept for reference only.

---

## Archived Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| check-schema.js | Verify schema structure | Point-in-time check |
| fix-instructor-availability.js | Fix availability table | Issue resolved |
| fix-instructor-availability-columns.js | Add missing columns | Migration applied |
| fix-migration-triggers.js | Fix trigger functions | Migration applied |
| fix-scheduling-settings.js | Fix scheduling settings | Issue resolved |
| run-migration-020.js | Run specific migration | Migration applied |
| run-migration-030.js | Run specific migration | Migration applied |

---

## Current Scripts

For database operations, use:

```bash
# Run a specific migration
node backend/database/run-migration.js 035

# Run all pending migrations
node backend/database/run-all-migrations.js

# Seed test data
node backend/database/run-seed.js

# Initial setup
node backend/database/setup-db.js
```

---

## Note

Do not run these archived scripts. The database schema has evolved and these scripts may cause conflicts.

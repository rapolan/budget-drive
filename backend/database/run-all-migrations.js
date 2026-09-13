/**
 * Run All Migrations in Order
 *
 * Tracks which migrations have already run in a schema_migrations table,
 * so a migration is only ever attempted ONCE against a given database -
 * never silently re-attempted on a later run, even "harmlessly" (Postgres
 * rejecting a duplicate CREATE TABLE/FUNCTION is not actually harmless as
 * a signal: it means nothing was tracking whether that migration had run,
 * which is exactly how migration 002 sat unapplied against production for
 * a while without anyone noticing - this runner re-attempted 001 every
 * time alongside it, and the resulting "everything ran, one had a
 * warning" output looked identical whether 002 had actually applied or
 * not).
 *
 * BACKFILL for a database that already has migrations applied but no
 * schema_migrations table (i.e. today's real production database): on
 * first run, if the tracking table is empty, check two explicit,
 * hardcoded markers - one per migration that could predate this tracking
 * table existing at all (001_baseline.sql and
 * 002_nullable_invite_user_fields.sql; nothing else has ever shipped, so
 * nothing else needs a marker, and no future migration will either,
 * since it will always go through this same tracking table from the
 * moment it's created):
 *   - 001_baseline.sql: the `users` table exists (to_regclass). Nothing
 *     else creates that table, so its existence unambiguously means 001
 *     already ran.
 *   - 002_nullable_invite_user_fields.sql: users.full_name is nullable
 *     (information_schema.columns.is_nullable = 'YES'). 001 creates that
 *     column NOT NULL, and 002 is the only migration that ever drops
 *     that constraint, so a nullable full_name unambiguously means 002
 *     already ran.
 * These are structural facts about the database, not a guess about how
 * far along production probably is.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// One-time bootstrap markers, scoped ONLY to migrations that could
// predate schema_migrations existing at all. Never add to this list -
// every migration from here on is tracked from the moment it first runs,
// so no future migration ever needs a marker like this.
const PRE_TRACKING_MARKERS = {
  '001_baseline.sql': async (client) => {
    const result = await client.query(`SELECT to_regclass('public.users') AS exists`);
    return result.rows[0].exists !== null;
  },
  '002_nullable_invite_user_fields.sql': async (client) => {
    const result = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'`
    );
    return result.rows.length > 0 && result.rows[0].is_nullable === 'YES';
  },
};

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r) => r.filename));
}

async function recordMigration(client, filename) {
  await client.query(
    'INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, NOW()) ON CONFLICT (filename) DO NOTHING',
    [filename]
  );
}

/**
 * Backfills schema_migrations for a database that already has migrations
 * applied but has never had this tracking table before (detected by the
 * table being freshly created and empty). Only ever checks the two
 * explicit markers above - anything not in PRE_TRACKING_MARKERS is left
 * untouched here and goes through the normal apply-or-skip path below.
 */
async function backfillPreTrackingMigrations(client, files) {
  const backfilled = [];
  for (const file of files) {
    const marker = PRE_TRACKING_MARKERS[file];
    if (!marker) continue;
    const alreadyApplied = await marker(client);
    if (alreadyApplied) {
      await recordMigration(client, file);
      backfilled.push(file);
    }
  }
  return backfilled;
}

async function runAllMigrations() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    await ensureTrackingTable(client);

    let applied = await getAppliedMigrations(client);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // Sort alphabetically (001, 002, etc.)

    // Backfill only runs meaningfully once, the first time this table
    // exists on a database that already has schema from before it - once
    // populated, getAppliedMigrations above (or the record written here)
    // means this block finds nothing left to backfill on every run after.
    if (applied.size === 0) {
      const backfilled = await backfillPreTrackingMigrations(client, files);
      if (backfilled.length > 0) {
        console.log('🔎 Backfilling schema_migrations for migrations that already ran before tracking existed:');
        for (const file of backfilled) {
          console.log(`   ✅ ${file} - detected already applied (structural check), recorded`);
        }
        console.log('');
        applied = await getAppliedMigrations(client);
      }
    }

    console.log(`Found ${files.length} migration file(s)\n`);

    const skipped = [];
    const newlyApplied = [];

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭️  ${file} - already applied, skipping\n`);
        skipped.push(file);
        continue;
      }

      console.log(`📦 Running: ${file}...`);
      const migrationPath = path.join(migrationsDir, file);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      try {
        await client.query(migrationSQL);
        await recordMigration(client, file);
        console.log(`   ✅ ${file} completed and recorded\n`);
        newlyApplied.push(file);
      } catch (error) {
        // A genuine failure (not a tracking gap - tracking is exactly
        // what prevents an already-applied migration from ever reaching
        // this point again) stops the run rather than silently
        // continuing past a real error.
        console.error(`   ❌ ${file} failed: ${error.message}\n`);
        await client.end();
        process.exit(1);
      }
    }

    console.log('============================================================');
    console.log(`✅ Migration run complete: ${newlyApplied.length} newly applied, ${skipped.length} already up to date.`);
    if (newlyApplied.length > 0) {
      console.log(`   Newly applied: ${newlyApplied.join(', ')}`);
    }
    if (skipped.length > 0) {
      console.log(`   Already applied: ${skipped.join(', ')}`);
    }
    console.log('============================================================');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration runner failed:', error.message);
    process.exit(1);
  }
}

runAllMigrations();

import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that migration 006's backfill UPDATE actually
 * works against real data - NOT a mock.
 *
 * migration006Backfill.test.ts (the other file with a similar name) is
 * a mocked wiring test only: it proves tenantService.getTenantSettings
 * correctly passes an onboarding_completed_at value through camelCase
 * conversion, using a hand-written mock row. It never runs migration
 * 006's real SQL and cannot prove the backfill UPDATE itself does what
 * it claims - a text-level check of the application layer, not of the
 * migration.
 *
 * THIS file inserts a real tenant_settings row with
 * onboarding_completed_at left at its pre-migration NULL state (by
 * inserting it, then nulling the column directly, simulating "a row
 * that existed before migration 006 ran"), re-runs the exact backfill
 * statement migration 006 contains, and asserts against the real
 * database that the row is no longer NULL - the actual thing the first
 * backend checkpoint's report could only state as "verified manually
 * during development," now captured as a repeatable, real-DB test.
 *
 * Gated behind TEST_DATABASE_URL via it.skipIf, same convention as
 * signupConcurrency.integration.test.ts - an absent env var shows as an
 * explicit, named skip, never a silent gap. Requires migration 006
 * already applied to the target database (run `npm run migrate` first).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe('real-Postgres proof: migration 006 backfill actually sets onboarding_completed_at', () => {
  it.skipIf(!TEST_DATABASE_URL)(
    'every pre-existing tenant_settings row ends up with a non-null onboarding_completed_at after the backfill UPDATE runs',
    async () => {
      const pool = new Pool({ connectionString: TEST_DATABASE_URL });
      let tenantId = '';

      try {
        // Set up a real tenant + tenant_settings row, then force
        // onboarding_completed_at back to NULL to simulate "a row that
        // existed before migration 006 ran" (migration 006 itself has
        // already added the column with no default by the time this
        // test runs against a migrated database).
        const tenantResult = await pool.query(
          `INSERT INTO tenants (name, slug, email, status, plan_tier)
           VALUES ('Backfill Proof School', $1, 'backfill-proof@example.com', 'active', 'basic')
           RETURNING id`,
          [`backfill-proof-${Date.now()}`]
        );
        tenantId = tenantResult.rows[0].id;

        await pool.query(
          `INSERT INTO tenant_settings (tenant_id, business_name, onboarding_completed_at)
           VALUES ($1, 'Backfill Proof School', NULL)`,
          [tenantId]
        );

        const beforeState = await pool.query(
          'SELECT onboarding_completed_at FROM tenant_settings WHERE tenant_id = $1',
          [tenantId]
        );
        expect(beforeState.rows[0].onboarding_completed_at).toBeNull();

        // The EXACT statement from migration 006's own file - re-run
        // here deliberately, against this one simulated-pre-existing
        // row, so this test proves the SQL itself works, not just that
        // the migration already ran once at some point in the past.
        await pool.query(
          `UPDATE tenant_settings SET onboarding_completed_at = NOW()
           WHERE onboarding_completed_at IS NULL`
        );

        const afterState = await pool.query(
          'SELECT onboarding_completed_at FROM tenant_settings WHERE tenant_id = $1',
          [tenantId]
        );
        expect(afterState.rows[0].onboarding_completed_at).not.toBeNull();
      } finally {
        if (tenantId) {
          // ON DELETE CASCADE on tenant_settings.tenant_id removes the
          // settings row too.
          await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
        }
        await pool.end();
      }
    }
  );

  it.skipIf(!TEST_DATABASE_URL)(
    'the backfill UPDATE never touches a row that already has a non-null onboarding_completed_at (idempotent, never overwrites a real wizard-completion timestamp)',
    async () => {
      const pool = new Pool({ connectionString: TEST_DATABASE_URL });
      let tenantId = '';

      try {
        const tenantResult = await pool.query(
          `INSERT INTO tenants (name, slug, email, status, plan_tier)
           VALUES ('Already Onboarded School', $1, 'already-onboarded@example.com', 'active', 'basic')
           RETURNING id`,
          [`already-onboarded-${Date.now()}`]
        );
        tenantId = tenantResult.rows[0].id;

        const specificTimestamp = '2026-01-15T10:00:00.000Z';
        await pool.query(
          `INSERT INTO tenant_settings (tenant_id, business_name, onboarding_completed_at)
           VALUES ($1, 'Already Onboarded School', $2)`,
          [tenantId, specificTimestamp]
        );

        await pool.query(
          `UPDATE tenant_settings SET onboarding_completed_at = NOW()
           WHERE onboarding_completed_at IS NULL`
        );

        const result = await pool.query(
          'SELECT onboarding_completed_at FROM tenant_settings WHERE tenant_id = $1',
          [tenantId]
        );
        expect(new Date(result.rows[0].onboarding_completed_at).toISOString()).toBe(specificTimestamp);
      } finally {
        if (tenantId) {
          await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
        }
        await pool.end();
      }
    }
  );
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';

/**
 * Real-Postgres concurrency test for the invite-code single-use claim.
 *
 * Every other signup test (signupFlow.test.ts) mocks the database, which
 * proves the CODE branches correctly on rowCount 0 vs 1 - it cannot prove
 * Postgres's actual row-lock behavior under two truly concurrent
 * connections racing the same UPDATE. This test opens two REAL,
 * independent connections against a REAL database and races them
 * against the exact atomic claim statement tenantSignupService.ts's
 * signupNewTenant runs, to prove row-level locking actually serializes
 * them the way the mocked tests assume.
 *
 * Gated behind TEST_DATABASE_URL so this suite never silently skips with
 * no record: if the env var is absent, the single test below explicitly
 * reports itself as skipped (visible in the vitest summary as a skip,
 * not a silent pass) rather than vanishing. CI sets TEST_DATABASE_URL
 * against the postgres: service container added to .github/workflows/
 * ci.yml specifically so this test runs on every push, not just locally.
 *
 * To run locally against a real Postgres instance:
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/signupConcurrency.integration.test.ts
 * (the target database must already have migration 006 applied - run
 * `npm run migrate` against it first.)
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe('real-Postgres concurrency: invite-code single-use claim', () => {
  let pool: Pool;
  const codeHash = crypto.createHash('sha256').update(`concurrency-test-${Date.now()}`).digest('hex');
  let inviteCodeId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return; // nothing to connect to - the test itself is skipped below
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const result = await pool.query(
      `INSERT INTO signup_invite_codes (code_hash, label, expires_at)
       VALUES ($1, 'concurrency-test', NOW() + INTERVAL '1 day')
       RETURNING id`,
      [codeHash]
    );
    inviteCodeId = result.rows[0].id;
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (inviteCodeId) {
      await pool.query('DELETE FROM signup_invite_codes WHERE id = $1', [inviteCodeId]);
    }
    await pool.end();
  });

  // skipIf (not a bare if-return inside the test body) so an absent
  // TEST_DATABASE_URL shows up as an explicit, named SKIP in the vitest
  // summary - never a silently-passing or silently-absent test.
  it.skipIf(!TEST_DATABASE_URL)('exactly one of two truly concurrent claims against the same code succeeds', async () => {
    // Two INDEPENDENT connections (not the same client/connection reused
    // sequentially) - this is what makes the race real rather than just
    // two awaited calls on one connection, which could never actually
    // race regardless of the SQL.
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    const claimSql = `UPDATE signup_invite_codes
       SET used_at = NOW()
       WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING id`;

    try {
      const [resultA, resultB] = await Promise.all([
        clientA.query(claimSql, [codeHash]),
        clientB.query(claimSql, [codeHash]),
      ]);

      const rowCounts = [resultA.rowCount, resultB.rowCount].sort();
      // One connection's UPDATE matches the row (rowCount 1); Postgres's
      // row-level locking serializes the second behind the first, and by
      // the time it runs, used_at IS NULL is already false, so it
      // matches zero rows (rowCount 0). Exactly one winner, one loser -
      // never both succeeding, never both failing.
      expect(rowCounts).toEqual([0, 1]);

      // Confirms the DB's own final state agrees: used_at is now set,
      // and only once (not clobbered by two writes racing each other).
      const finalState = await pool.query('SELECT used_at FROM signup_invite_codes WHERE id = $1', [inviteCodeId]);
      expect(finalState.rows[0].used_at).not.toBeNull();
    } finally {
      clientA.release();
      clientB.release();
    }
  });
});

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that receipt dates, CSV export dates, and
 * who-owes-you's "last paid" date all agree with the tenant's OWN
 * school-local calendar, under a hostile Node process TZ, at several
 * different UTC hours - payments-dates-and-cards.
 *
 * Background (see adjustmentServiceRealDb.integration.test.ts's own
 * hostile-clock tests for the full root-cause writeup): two independent
 * bug classes were found and fixed in this area.
 * 1. WRITE path: a JS `new Date()` passed as a bound parameter into a
 *    `timestamp without time zone` column is serialized by pg using the
 *    Node PROCESS's local TZ, not UTC - fixed at the connection-pool
 *    level (database.ts's `options: '-c timezone=UTC'`) plus, for
 *    payment_adjustments.created_at specifically, by never passing a JS
 *    Date into that column at all (adjustmentService.createAdjustment
 *    now reads Postgres's own now() back as plain text).
 * 2. READ path: even a CORRECTLY-stored value, read back the normal way
 *    (letting pg parse it into a JS Date), round-trips through the Node
 *    process's local TZ again and can represent the WRONG instant under
 *    a hostile TZ - the fix is to resolve the tenant-local calendar date
 *    entirely in SQL (tenantLocalDateSql) and read it back as plain text,
 *    never as a parsed JS Date.
 *
 * This test tenant has no explicit tenant_settings.timezone row, so
 * resolveTenantTimezone falls back to DEFAULT_TENANT_TIMEZONE
 * ('America/Los_Angeles') - deliberately not UTC, so these tests also
 * prove the TENANT-LOCAL resolution (not just "is it UTC-safe") is what
 * each function actually uses.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as every other *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/paymentDatesHostileClockRealDb.integration.test.ts
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TENANT_TIMEZONE = 'America/Los_Angeles';

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    DB_HOST: u.hostname,
    DB_PORT: u.port || '5432',
    DB_NAME: u.pathname.replace(/^\//, ''),
    DB_USER: decodeURIComponent(u.username),
    DB_PASSWORD: decodeURIComponent(u.password),
  };
}

describe('real-Postgres: receipt/export/who-owes-you dates agree with the tenant calendar (hostile-clock)', () => {
  let pool: Pool;
  let paymentService: typeof import('../services/paymentService');
  let adjustmentService: typeof import('../services/adjustmentService');
  let paymentReportingService: typeof import('../services/paymentReportingService');

  let realTenantId: string;
  let adminUserId: string;
  let instructorId: string;
  let vehicleId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    const { vi } = await import('vitest');
    vi.resetModules();
    paymentService = await import('../services/paymentService');
    adjustmentService = await import('../services/adjustmentService');
    paymentReportingService = await import('../services/paymentReportingService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Payment Dates Hostile-Clock Test School', $1, 'payment-dates-hostile-clock@example.com', 'active', 'basic')
       RETURNING id`,
      [`payment-dates-hostile-clock-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, 'Test Admin')
       RETURNING id`,
      [`payment-dates-admin-${Date.now()}@example.com`, '$2b$10$' + 'x'.repeat(53)]
    );
    adminUserId = userResult.rows[0].id;
    await pool.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [adminUserId, realTenantId]
    );

    // Only who-owes-you's test needs a real lesson row (to satisfy its
    // "at least one completed lesson" WHERE clause) - instructor/vehicle
    // are required NOT NULL columns on lessons.
    const instructorResult = await pool.query(
      `INSERT INTO instructors (tenant_id, full_name, email, phone, hire_date, status)
       VALUES ($1, 'Hostile-Clock Test Instructor', $2, '555-0100', CURRENT_DATE, 'active')
       RETURNING id`,
      [realTenantId, `instructor-payment-dates-${Date.now()}@example.com`]
    );
    instructorId = instructorResult.rows[0].id;

    const vehicleResult = await pool.query(
      `INSERT INTO vehicles (tenant_id, ownership_type, make, model, year, license_plate, registration_expiration, insurance_expiration, status)
       VALUES ($1, 'school_owned', 'Toyota', 'Corolla', 2024, $2, CURRENT_DATE + INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', 'active')
       RETURNING id`,
      [realTenantId, `TPD-${Date.now() % 1000000}`]
    );
    vehicleId = vehicleResult.rows[0].id;
  });

  // Runs disable/delete/enable as one transaction on one dedicated
  // client - see setAdjustmentCreatedAt's own comment below for why this
  // matters once more than one *RealDb.integration.test.ts file touches
  // payment_adjustments' triggers concurrently (vitest's default
  // file-level parallelism).
  async function deleteAdjustmentsForTenant(tenantId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE payment_adjustments DISABLE TRIGGER ALL');
      await client.query('DELETE FROM payment_adjustments WHERE tenant_id = $1', [tenantId]);
      await client.query('ALTER TABLE payment_adjustments ENABLE TRIGGER ALL');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await deleteAdjustmentsForTenant(realTenantId);
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM vehicles WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM instructors WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM user_tenant_memberships WHERE tenant_id = $1', [realTenantId]);
    }
    if (adminUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [adminUserId]);
    }
    if (realTenantId) await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    await pool.end();
  });

  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
    await deleteAdjustmentsForTenant(realTenantId);
    await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM lessons WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
  });

  async function makeStudentEnrollmentPayment(totalCost: number, paidAmount: number) {
    const studentResult = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, 'Hostile-Clock Test Student', 'Hostile-Clock', 'Test', '1995-01-01')
       RETURNING id`,
      [realTenantId]
    );
    const studentId = studentResult.rows[0].id as string;

    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required, total_cost)
       VALUES ($1, $2, 'driver_training', 'active', 30, $3)
       RETURNING id`,
      [realTenantId, studentId, totalCost]
    );
    const enrollmentId = enrollmentResult.rows[0].id as string;

    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: paidAmount,
      paymentMethod: 'cash',
    });

    return { studentId, enrollmentId, paymentId: payment.id };
  }

  // Every hour below is chosen deliberately: several straddle the UTC
  // calendar boundary while it is still (or already) a DIFFERENT
  // calendar day in America/Los_Angeles - a test that only used hours
  // where UTC and the tenant's timezone agree could pass even with the
  // bug still present.
  const HOSTILE_HOURS: [string, string][] = [
    ['02:00 UTC', '2026-11-27T02:00:00.000Z'],
    ['09:30 UTC', '2026-11-27T09:30:00.000Z'],
    ['10:30 UTC', '2026-11-27T10:30:00.000Z'],
    ['16:50 UTC', '2026-11-27T16:50:00.000Z'],
    ['23:50 UTC', '2026-11-27T23:50:00.000Z'],
  ];

  // Directly overwrites an already-inserted payment_adjustments row's
  // created_at to an explicit UTC instant, bypassing createAdjustment's
  // own write path entirely - necessary because createAdjustment now
  // writes created_at via Postgres's own now() (the whole point of the
  // write-path fix), which makes it structurally IMMUNE to
  // vi.setSystemTime()/a faked process clock. To genuinely vary which
  // calendar day gets STORED across the parameterized hours below (and
  // so prove the READ-path tenant-local resolution, not just "does the
  // write path still work"), this test needs direct control over the
  // stored instant - a one-time, test-only UPDATE on an append-only
  // table, same disable-trigger pattern deleteAdjustmentsForTenant
  // already uses for cleanup.
  //
  // DISABLE/ENABLE TRIGGER is a persistent catalog change, NOT scoped to
  // a connection or session - running the disable/update/enable sequence
  // as three separate pool.query() calls (each potentially checking out
  // a DIFFERENT pooled connection) is unsafe the moment another test
  // FILE is running concurrently against the same shared dev database
  // (vitest's default file-level parallelism runs multiple
  // *RealDb.integration.test.ts files at once) - confirmed by direct
  // reproduction: adjustmentServiceRealDb.integration.test.ts's own
  // cleanup re-enabling the trigger mid-sequence here caused a real
  // "payment_adjustments is append-only: UPDATE is not permitted" error.
  // Fixed by running all three statements on ONE dedicated client inside
  // an explicit transaction - confirmed by direct probe that Postgres's
  // own DDL locking then correctly serializes two concurrent
  // disable/enable sequences against each other (one fully commits,
  // including its own re-enable, before the other can even acquire its
  // lock to disable), eliminating the race entirely.
  async function setAdjustmentCreatedAt(adjustmentId: string, utcInstant: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE payment_adjustments DISABLE TRIGGER ALL');
      await client.query('UPDATE payment_adjustments SET created_at = $2 WHERE id = $1', [adjustmentId, utcInstant]);
      await client.query('ALTER TABLE payment_adjustments ENABLE TRIGGER ALL');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  describe('receipt date agrees with the tenant calendar', () => {
    // payments.date's write path (paymentService.createPayment's own
    // tenantToday(...) fallback) IS a plain JS computation using
    // new Date() as its default reference - genuinely affected by
    // vi.setSystemTime(), unlike payment_adjustments.created_at above.
    it.each(HOSTILE_HOURS)(
      'getPaymentReceiptData returns the payment\'s own date, unaffected by the process clock, at %s',
      async (_label, fakeInstant) => {
        if (!TEST_DATABASE_URL) return;
        const originalTZ = process.env.TZ;
        process.env.TZ = 'Pacific/Kiritimati';
        vi.useFakeTimers();
        vi.setSystemTime(new Date(fakeInstant));
        try {
          const { paymentId } = await makeStudentEnrollmentPayment(300, 300);
          const receipt = await paymentReportingService.getPaymentReceiptData(realTenantId, paymentId);
          expect(receipt).not.toBeNull();

          // Ground truth: the payment's own stored date, read as plain
          // text (payments.date is a plain calendar date set directly
          // from the tenant-local "today" PaymentModal/createPayment's
          // own fallback resolves - see paymentService.createPayment's
          // own comment).
          const truth = await pool.query('SELECT date::text AS d FROM payments WHERE id = $1', [paymentId]);
          expect(receipt!.date).toBe(truth.rows[0].d);
        } finally {
          vi.useRealTimers();
          process.env.TZ = originalTZ;
        }
      }
    );

    // created_at is genuinely varied here by directly overwriting the
    // stored instant (see setAdjustmentCreatedAt above) - process.env.TZ
    // is still set hostile for the READ side (getPaymentReceiptData's
    // own tenantLocalDateSql-based query), proving the read resolution
    // is correct regardless of the server process's own clock/timezone,
    // independent of whatever vi.setSystemTime would or wouldn't affect.
    it.each(HOSTILE_HOURS)(
      'getPaymentReceiptData resolves a refund adjustment line to the tenant-local date, at %s',
      async (_label, fakeInstant) => {
        if (!TEST_DATABASE_URL) return;
        const originalTZ = process.env.TZ;
        process.env.TZ = 'Pacific/Kiritimati';
        try {
          const { paymentId } = await makeStudentEnrollmentPayment(300, 300);
          const adjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
            adjustmentType: 'refund',
            amount: 30,
            reasonCode: 'overpaid',
          });
          await setAdjustmentCreatedAt(adjustment.id, fakeInstant);

          const receipt = await paymentReportingService.getPaymentReceiptData(realTenantId, paymentId);
          expect(receipt!.adjustments).toHaveLength(1);

          const truth = await pool.query(
            `SELECT ((created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date::text AS d
             FROM payment_adjustments WHERE payment_id = $1`,
            [paymentId, TENANT_TIMEZONE]
          );
          expect(receipt!.adjustments[0].createdAt).toBe(truth.rows[0].d);
        } finally {
          process.env.TZ = originalTZ;
        }
      }
    );
  });

  describe('CSV export dates agree with the tenant calendar', () => {
    it.each(HOSTILE_HOURS)(
      'getPaymentsForExport dates both the payment row and the adjustment row by the tenant calendar, at %s',
      async (_label, fakeInstant) => {
        if (!TEST_DATABASE_URL) return;
        const originalTZ = process.env.TZ;
        process.env.TZ = 'Pacific/Kiritimati';
        try {
          const { paymentId } = await makeStudentEnrollmentPayment(300, 100);
          const adjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
            adjustmentType: 'refund',
            amount: 30,
            reasonCode: 'overpaid',
          });
          await setAdjustmentCreatedAt(adjustment.id, fakeInstant);

          const paymentDateTruth = await pool.query('SELECT date::text AS d FROM payments WHERE id = $1', [paymentId]);
          const adjustmentDateTruth = await pool.query(
            `SELECT ((created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date::text AS d
             FROM payment_adjustments WHERE id = $1`,
            [adjustment.id, TENANT_TIMEZONE]
          );
          const paymentDate: string = paymentDateTruth.rows[0].d;
          const adjustmentDate: string = adjustmentDateTruth.rows[0].d;

          // A range covering both dates (they can differ by a day
          // depending on when the refund landed relative to the
          // payment).
          const rangeStart = paymentDate < adjustmentDate ? paymentDate : adjustmentDate;
          const rangeEnd = paymentDate > adjustmentDate ? paymentDate : adjustmentDate;
          const rows = await paymentReportingService.getPaymentsForExport(realTenantId, rangeStart, rangeEnd);

          const paymentRow = rows.find((r) => r.rowType === 'payment');
          const adjustmentRow = rows.find((r) => r.rowType === 'adjustment');
          expect(paymentRow).toBeDefined();
          expect(adjustmentRow).toBeDefined();
          expect(paymentRow!.date).toBe(paymentDate);
          expect(adjustmentRow!.date).toBe(adjustmentDate);
        } finally {
          process.env.TZ = originalTZ;
        }
      }
    );
  });

  describe('who-owes-you "last paid" date agrees with the tenant calendar', () => {
    it.each(HOSTILE_HOURS)(
      'getWhoOwesYou reports lastPaymentDate matching the payment\'s own stored date, at %s',
      async (_label, fakeInstant) => {
        if (!TEST_DATABASE_URL) return;
        const originalTZ = process.env.TZ;
        process.env.TZ = 'Pacific/Kiritimati';
        vi.useFakeTimers();
        vi.setSystemTime(new Date(fakeInstant));
        try {
          // A partial payment, so the enrollment still owes something
          // and shows up in who-owes-you (its WHERE clause requires a
          // positive outstanding balance AND at least one completed
          // lesson - seed one completed lesson directly, since
          // createPayment alone never creates a lesson). payments.date
          // is genuinely varied here by vi.setSystemTime (see the
          // receipt describe block's own comment on why this differs
          // from payment_adjustments.created_at).
          const { paymentId, enrollmentId } = await makeStudentEnrollmentPayment(300, 100);
          await pool.query(
            `INSERT INTO lessons (tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, cost, lesson_type)
             VALUES ($1, $2, $3, $4, CURRENT_DATE - INTERVAL '1 day', '09:00', '10:30', 1.5, 'completed', 100, 'behind_wheel')`,
            [realTenantId, enrollmentId, instructorId, vehicleId]
          );

          const truth = await pool.query('SELECT date::text AS d FROM payments WHERE id = $1', [paymentId]);
          const paymentDate: string = truth.rows[0].d;

          const rows = await paymentReportingService.getWhoOwesYou(realTenantId);
          const row = rows.find((r) => r.enrollmentId === enrollmentId);
          expect(row).toBeDefined();
          expect(row!.lastPaymentDate).toBe(paymentDate);
        } finally {
          vi.useRealTimers();
          process.env.TZ = originalTZ;
        }
      }
    );
  });
});

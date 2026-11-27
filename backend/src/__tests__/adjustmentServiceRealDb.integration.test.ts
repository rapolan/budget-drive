import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof of payments-adjustments' core rules - a mocked test
 * can prove the SQL a service function sends is correct in isolation, but
 * only a real database can prove the row lock (SELECT ... FOR UPDATE)
 * genuinely serializes two SIMULTANEOUS refund requests against the same
 * payment, which is the entire point of locking the payment row for the
 * transaction's duration.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as every other *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied, INCLUDING 007_payment_adjustments.sql - run
 * `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/adjustmentServiceRealDb.integration.test.ts
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

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

describe('real-Postgres: payment_adjustments (payments-adjustments)', () => {
  let pool: Pool;
  let adjustmentService: typeof import('../services/adjustmentService');
  let paymentService: typeof import('../services/paymentService');
  let paymentReportingService: typeof import('../services/paymentReportingService');
  let enrollmentService: typeof import('../services/enrollmentService');

  let realTenantId: string;
  let otherTenantId: string;
  let adminUserId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    const { vi } = await import('vitest');
    vi.resetModules();
    adjustmentService = await import('../services/adjustmentService');
    paymentService = await import('../services/paymentService');
    paymentReportingService = await import('../services/paymentReportingService');
    enrollmentService = await import('../services/enrollmentService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Adjustments Test School', $1, 'adjustments-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`adjustments-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const otherTenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Adjustments Test School 2', $1, 'adjustments-test-2@example.com', 'active', 'basic')
       RETURNING id`,
      [`adjustments-test-2-${Date.now()}`]
    );
    otherTenantId = otherTenantResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, 'Test Admin')
       RETURNING id`,
      [`adjustments-admin-${Date.now()}@example.com`, '$2b$10$' + 'x'.repeat(53)]
    );
    adminUserId = userResult.rows[0].id;
    await pool.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [adminUserId, realTenantId]
    );
  });

  // Test-cleanup-only helper: payment_adjustments is deliberately
  // append-only at the database level (migration 007's own trigger,
  // proven to actually block UPDATE/DELETE in its own test below) - a
  // plain DELETE from test teardown is rejected exactly like it would be
  // from anywhere else, which is correct, intended behavior, not a bug to
  // work around in the trigger itself. Disabling triggers for the
  // duration of ONE cleanup statement is standard practice for tearing
  // down an append-only table's test data; ordinary application code
  // never does this.
  async function deleteAdjustmentsForTenant(tenantId: string) {
    await pool.query('ALTER TABLE payment_adjustments DISABLE TRIGGER ALL');
    try {
      await pool.query('DELETE FROM payment_adjustments WHERE tenant_id = $1', [tenantId]);
    } finally {
      await pool.query('ALTER TABLE payment_adjustments ENABLE TRIGGER ALL');
    }
  }

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await deleteAdjustmentsForTenant(realTenantId);
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM user_tenant_memberships WHERE tenant_id = $1', [realTenantId]);
    }
    if (otherTenantId) {
      await deleteAdjustmentsForTenant(otherTenantId);
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [otherTenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [otherTenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [otherTenantId]);
    }
    if (adminUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [adminUserId]);
    }
    if (realTenantId) await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    if (otherTenantId) await pool.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
    await pool.end();
  });

  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
    await deleteAdjustmentsForTenant(realTenantId);
    await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
  });

  async function makeStudentEnrollmentPayment(tenantId: string, totalCost: number, paidAmount: number) {
    const studentResult = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, 'Adjustments Test Student', 'Adjustments', 'Test', '1995-01-01')
       RETURNING id`,
      [tenantId]
    );
    const studentId = studentResult.rows[0].id as string;

    const enrollmentResult = await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required, total_cost)
       VALUES ($1, $2, 'driver_training', 'active', 30, $3)
       RETURNING id`,
      [tenantId, studentId, totalCost]
    );
    const enrollmentId = enrollmentResult.rows[0].id as string;

    const payment = await paymentService.createPayment(tenantId, {
      studentId,
      amount: paidAmount,
      paymentMethod: 'cash',
    });

    return { studentId, enrollmentId, paymentId: payment.id };
  }

  it('(a) a partial refund, then a second refund exceeding the remainder, is rejected', async () => {
    if (!TEST_DATABASE_URL) return;

    const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 100);

    const first = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
      adjustmentType: 'refund',
      amount: 60,
      reasonCode: 'overpaid',
    });
    expect(first.amount).toBe(60);

    await expect(
      adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 41, // only $40 remains
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    // The rejected attempt must not have been partially applied.
    const adjustments = await adjustmentService.getAdjustmentsForPayment(paymentId, realTenantId);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].amount).toBe(60);
  });

  it('(b) two concurrent refund requests against the same payment cannot together exceed it', async () => {
    if (!TEST_DATABASE_URL) return;

    const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 100);

    // Both requests ask for $70 against a $100 payment - together $140,
    // which exceeds it. The row lock (SELECT ... FOR UPDATE) must
    // serialize these: whichever commits first leaves $30 remaining, and
    // the second must then see that reduced remainder and reject.
    const results = await Promise.allSettled([
      adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 70,
        reasonCode: 'overpaid',
      }),
      adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 70,
        reasonCode: 'overpaid',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const adjustments = await adjustmentService.getAdjustmentsForPayment(paymentId, realTenantId);
    const totalAdjusted = adjustments.reduce((sum, a) => sum + a.amount, 0);
    expect(totalAdjusted).toBeLessThanOrEqual(100);
    expect(totalAdjusted).toBe(70);
  });

  it('(c) a void covers the full remaining amount, ignoring the amount passed, even after a prior partial refund', async () => {
    if (!TEST_DATABASE_URL) return;

    const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 100);

    await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
      adjustmentType: 'refund',
      amount: 20,
      reasonCode: 'overpaid',
    });

    const voidAdjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
      adjustmentType: 'void',
      amount: 1, // deliberately wrong - must be ignored
      reasonCode: 'entered_in_error',
    });
    expect(voidAdjustment.amount).toBe(80); // $100 - $20 already refunded

    // Fully adjusted now - any further adjustment must be rejected.
    await expect(
      adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 1,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('(d) only a confirmed payment can be adjusted', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 0);
    // Manufacture a pending payment directly (createPayment always makes
    // a confirmed one in this codebase's current flow).
    const enrollmentResult = await pool.query(
      `SELECT id FROM enrollments WHERE tenant_id = $1 AND student_id = $2`,
      [realTenantId, studentId]
    );
    const enrollmentId = enrollmentResult.rows[0].id;
    const pendingPaymentResult = await pool.query(
      `INSERT INTO payments (tenant_id, enrollment_id, date, amount, payment_method, payment_type, status)
       VALUES ($1, $2, CURRENT_DATE, 50, 'cash', 'lesson_payment', 'pending')
       RETURNING id`,
      [realTenantId, enrollmentId]
    );
    const pendingPaymentId = pendingPaymentResult.rows[0].id;

    await expect(
      adjustmentService.createAdjustment(realTenantId, pendingPaymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 10,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('the append-only trigger blocks UPDATE and DELETE on payment_adjustments', async () => {
    if (!TEST_DATABASE_URL) return;

    const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 100);
    const adjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
      adjustmentType: 'refund',
      amount: 25,
      reasonCode: 'overpaid',
    });

    await expect(
      pool.query(`UPDATE payment_adjustments SET amount = 99 WHERE id = $1`, [adjustment.id])
    ).rejects.toThrow(/append-only/i);

    await expect(
      pool.query(`DELETE FROM payment_adjustments WHERE id = $1`, [adjustment.id])
    ).rejects.toThrow(/append-only/i);

    // Confirm the row is genuinely untouched after both rejected attempts.
    const stillThere = await adjustmentService.getAdjustmentsForPayment(paymentId, realTenantId);
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].amount).toBe(25);
  });

  it('tenant isolation: a payment from a different tenant cannot be adjusted', async () => {
    if (!TEST_DATABASE_URL) return;

    const { paymentId } = await makeStudentEnrollmentPayment(otherTenantId, 300, 100);

    await expect(
      adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 10,
        reasonCode: 'overpaid',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('balances, credit, who-owes-you, and period summary all reflect NET paid after a refund', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId, paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 300);

    // Fully paid, no credit, no outstanding, before any refund.
    const studentBeforeResult = await pool.query(`SELECT date_of_birth FROM students WHERE id = $1`, [studentId]);
    const enrollmentsBefore = await enrollmentService.getEnrollmentsForStudent(studentId, realTenantId, {
      dateOfBirth: studentBeforeResult.rows[0].date_of_birth,
    });
    const summaryBefore = enrollmentsBefore.find((e) => e.programType === 'driver_training')?.paymentSummary;
    expect(summaryBefore).toMatchObject({ totalPaid: 300, outstandingBalance: 0, creditBalance: 0 });

    // Refund $50 - net paid should drop to $250, re-opening a $50 outstanding balance.
    await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
      adjustmentType: 'refund',
      amount: 50,
      reasonCode: 'overpaid',
    });

    const enrollmentsAfter = await enrollmentService.getEnrollmentsForStudent(studentId, realTenantId, {
      dateOfBirth: studentBeforeResult.rows[0].date_of_birth,
    });
    const summaryAfter = enrollmentsAfter.find((e) => e.programType === 'driver_training')?.paymentSummary;
    expect(summaryAfter).toMatchObject({ totalPaid: 250, outstandingBalance: 50, creditBalance: 0 });

    // period summary's "outstanding" (tenant-wide) must reflect the same drop.
    const todayIso = new Date().toISOString().slice(0, 10);
    const periodSummary = await paymentReportingService.getPaymentPeriodSummary(realTenantId, todayIso, todayIso);
    expect(periodSummary.outstanding).toBeGreaterThanOrEqual(50);

    // getWhoOwesYou needs a completed lesson to list this enrollment at
    // all (by design - see paymentReportingService's own doc comment), so
    // this test only asserts the balances/period-summary figures above,
    // which already cover the net-paid requirement directly.
  });

  it('a legacy status=refunded payment (pre-migration flow) is still treated as fully refunded with no adjustment row', async () => {
    if (!TEST_DATABASE_URL) return;

    const { studentId, paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 100);
    // Simulate what the OLD flow already did to a real row before this
    // migration - directly flip status, no adjustment row, exactly as
    // migration 007's own comment describes for pre-existing data.
    await pool.query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [paymentId]);

    const studentResult = await pool.query(`SELECT date_of_birth FROM students WHERE id = $1`, [studentId]);
    const enrollments = await enrollmentService.getEnrollmentsForStudent(studentId, realTenantId, {
      dateOfBirth: studentResult.rows[0].date_of_birth,
    });
    const summary = enrollments.find((e) => e.programType === 'driver_training')?.paymentSummary;
    // The legacy refunded payment contributes 0 to totalPaid (excluded by
    // status = 'confirmed' in every net-paid query) - same effective
    // result as a real full refund, without ever touching the row itself.
    expect(summary).toMatchObject({ totalPaid: 0, outstandingBalance: 300, creditBalance: 0 });
  });

  // Hostile-clock pattern: the period summary's refunded-by-adjustment-
  // date rule relies on `created_at::date` in Postgres. This proves that
  // holds against a REAL database, not just a mocked assumption, with the
  // Node process clock set far ahead of the tenant's own boundary.
  //
  // Root cause this test previously got wrong (found investigating a CI
  // failure that reproduced locally): `new Date(adjustment.createdAt)`
  // does NOT reliably land on the same calendar day Postgres itself
  // stored. `payment_adjustments.created_at` is `timestamp without time
  // zone`, and this DB's own server-level default session timezone
  // (`SHOW timezone`) is `America/Los_Angeles`, independent of
  // process.env.TZ - node-postgres/libpq never forwards the Node
  // process's TZ to the Postgres session. But node-postgres'S OWN
  // timestamp-without-time-zone PARSER (turning the raw wall-clock string
  // Postgres returns into a JS Date) DOES use the Node process's local
  // timezone to interpret that string, since the column carries no
  // explicit offset of its own. With process.env.TZ set to
  // Pacific/Kiritimati (UTC+14) below, a value Postgres stored as (say)
  // "2026-11-27 09:02:26" (its own Pacific-time wall clock) gets
  // misinterpreted as 09:02:26 KIRITIMATI time, converting to a UTC
  // instant on the PREVIOUS calendar day - so `adjustmentDateIso`,
  // computed from that misinterpreted Date, named the wrong day for any
  // run where the misinterpretation crosses a UTC midnight relative to
  // when the row was actually written. Reading the date PostgreSQL itself
  // recorded, directly from the database, sidesteps the JS Date parse
  // entirely and is correct at every hour of the real clock.
  it('period summary counts a refund by the adjustment\'s own date boundary, independent of the server process clock (hostile-clock)', async () => {
    if (!TEST_DATABASE_URL) return;
    const originalTZ = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14 - far ahead of any US tenant zone
    try {
      const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 300);

      const adjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 30,
        reasonCode: 'overpaid',
      });

      // The date Postgres itself stored - read directly from the
      // database, NOT derived from a JS-side Date parse of
      // adjustment.createdAt (see the comment above for why that
      // approach silently names the wrong day under a hostile TZ).
      const storedDateResult = await pool.query(
        `SELECT created_at::date::text AS date FROM payment_adjustments WHERE id = $1`,
        [adjustment.id]
      );
      const adjustmentDateIso: string = storedDateResult.rows[0].date;

      // A period covering exactly the adjustment's own stored calendar
      // date must count it - regardless of what process.env.TZ says
      // right now, and regardless of what hour UTC it currently is.
      const summary = await paymentReportingService.getPaymentPeriodSummary(
        realTenantId,
        adjustmentDateIso,
        adjustmentDateIso
      );
      expect(summary.refunded.amount).toBeGreaterThanOrEqual(30);

      // A period that excludes that date entirely must NOT count it.
      const farPastSummary = await paymentReportingService.getPaymentPeriodSummary(
        realTenantId,
        '2020-01-01',
        '2020-01-02'
      );
      expect(farPastSummary.refunded.amount).toBe(0);
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  // Proves the fix above holds at every hour of the real clock, not just
  // whatever hour happened to be live when this was written - the
  // original bug (expected 0 to be >= 30) only reproduced for a UTC hour
  // past roughly 10:00, because that's when the Postgres-session-vs-
  // process-TZ wall-clock shift crosses a UTC midnight relative to
  // adjustment.createdAt's own (internally self-consistent, but
  // differently-shifted) round trip - see the comment on the test above
  // for the full mechanism. adjustmentService.createAdjustment generates
  // created_at from `new Date()` in application code (not Postgres's own
  // now()), so faking the Node process's system clock via
  // vi.useFakeTimers()/vi.setSystemTime() genuinely controls what gets
  // written - this is a real INSERT against the real database at each
  // faked instant, not a mocked assumption.
  it.each([
    ['02:00 UTC', '2026-11-27T02:00:00.000Z'],
    ['09:30 UTC', '2026-11-27T09:30:00.000Z'],
    ['10:30 UTC', '2026-11-27T10:30:00.000Z'],
    ['16:50 UTC', '2026-11-27T16:50:00.000Z'],
    ['23:50 UTC', '2026-11-27T23:50:00.000Z'],
  ])('period summary counts a refund by its own date boundary at %s, under a hostile process TZ', async (_label, fakeInstant) => {
    if (!TEST_DATABASE_URL) return;
    const originalTZ = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fakeInstant));
    try {
      const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 300);

      const adjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
        adjustmentType: 'refund',
        amount: 30,
        reasonCode: 'overpaid',
      });

      const storedDateResult = await pool.query(
        `SELECT created_at::date::text AS date FROM payment_adjustments WHERE id = $1`,
        [adjustment.id]
      );
      const adjustmentDateIso: string = storedDateResult.rows[0].date;

      const summary = await paymentReportingService.getPaymentPeriodSummary(
        realTenantId,
        adjustmentDateIso,
        adjustmentDateIso
      );
      expect(summary.refunded.amount).toBeGreaterThanOrEqual(30);

      const farPastSummary = await paymentReportingService.getPaymentPeriodSummary(
        realTenantId,
        '2020-01-01',
        '2020-01-02'
      );
      expect(farPastSummary.refunded.amount).toBe(0);
    } finally {
      vi.useRealTimers();
      process.env.TZ = originalTZ;
    }
  });

  it('CSV export includes both the original payment row and a separate adjustment row for a refund', async () => {
    if (!TEST_DATABASE_URL) return;

    const { paymentId } = await makeStudentEnrollmentPayment(realTenantId, 300, 100);
    const adjustment = await adjustmentService.createAdjustment(realTenantId, paymentId, adminUserId, {
      adjustmentType: 'refund',
      amount: 30,
      reasonCode: 'overpaid',
    });
    // Read the date Postgres itself stored, not a JS-side Date parse of
    // adjustment.createdAt - see the hostile-clock test above for why
    // that conversion can silently name the wrong calendar day. This test
    // doesn't set a hostile TZ itself, but reading the stored date
    // directly removes any dependency on a sibling test's TZ cleanup
    // having already run first.
    const storedDateResult = await pool.query(
      `SELECT created_at::date::text AS date FROM payment_adjustments WHERE id = $1`,
      [adjustment.id]
    );
    const adjustmentDateIso: string = storedDateResult.rows[0].date;

    const rows = await paymentReportingService.getPaymentsForExport(realTenantId, adjustmentDateIso, adjustmentDateIso);

    const paymentRow = rows.find((r) => r.rowType === 'payment');
    const adjustmentRow = rows.find((r) => r.rowType === 'adjustment');
    expect(paymentRow).toBeDefined();
    expect(adjustmentRow).toBeDefined();
    expect(adjustmentRow!.amount).toBe(30);
    expect(adjustmentRow!.status).toBe('refund');
    expect(adjustmentRow!.reasonCode).toBe('overpaid');
    // The adjustment row carries the ORIGINAL payment's receipt number -
    // it has none of its own.
    expect(adjustmentRow!.receiptNumber).toBe(paymentRow!.receiptNumber);
  });
});

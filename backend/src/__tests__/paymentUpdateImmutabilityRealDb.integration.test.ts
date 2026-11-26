import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof that PUT /payments/:id can no longer be used to
 * bypass the append-only payment_adjustments model. Before this fix,
 * owner/admin/staff could flip amount, date, paymentMethod, status, or
 * bsvTransactionId on a confirmed payment directly - e.g. setting status
 * to 'refunded' with no adjustment row, or lowering amount with no
 * correction trail at all. notes/referenceNumber stay editable
 * regardless of status; pending/failed payments are unaffected.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as every other *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/paymentUpdateImmutabilityRealDb.integration.test.ts
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

describe('real-Postgres: PUT /payments/:id locked-field immutability (payments-adjustments fix)', () => {
  let pool: Pool;
  let paymentService: typeof import('../services/paymentService');

  let realTenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    const { vi } = await import('vitest');
    vi.resetModules();
    paymentService = await import('../services/paymentService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Payment Update Immutability Test School', $1, 'payment-update-immutability-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`payment-update-immutability-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;

    const otherTenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Payment Update Immutability Other Tenant', $1, 'payment-update-immutability-other@example.com', 'active', 'basic')
       RETURNING id`,
      [`payment-update-immutability-other-${Date.now()}`]
    );
    otherTenantId = otherTenantResult.rows[0].id;
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    for (const tenantId of [realTenantId, otherTenantId]) {
      if (!tenantId) continue;
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
    await pool.end();
  });

  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
    for (const tenantId of [realTenantId, otherTenantId]) {
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [tenantId]);
    }
  });

  async function makeStudentWithEnrollment(tenantId: string, label: string) {
    const studentResult = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, $2, $2, 'Test', '1995-01-01')
       RETURNING id`,
      [tenantId, label]
    );
    const studentId = studentResult.rows[0].id as string;

    await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required, total_cost)
       VALUES ($1, $2, 'driver_training', 'active', 30, 300.00)`,
      [tenantId, studentId]
    );

    return studentId;
  }

  it('rejects an amount change on a confirmed payment with 409', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(realTenantId, 'Confirmed Amount Student');
    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
    });

    await expect(
      paymentService.updatePayment(payment.id, realTenantId, { amount: 50 })
    ).rejects.toMatchObject({ statusCode: 409 });

    const unchanged = await paymentService.getPaymentById(payment.id, realTenantId);
    // amount is a Postgres numeric column - serializes as a string
    // (CLAUDE.md's numeric-coercion rule), so compare numerically.
    expect(Number(unchanged!.amount)).toBe(100);
  });

  it('rejects a status change on a confirmed payment with 409, proving the old refund-by-flip path is gone', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(realTenantId, 'Confirmed Status Student');
    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
    });

    await expect(
      paymentService.updatePayment(payment.id, realTenantId, { status: 'refunded' })
    ).rejects.toMatchObject({ statusCode: 409 });

    const unchanged = await paymentService.getPaymentById(payment.id, realTenantId);
    expect(unchanged!.status).toBe('confirmed');
  });

  it('rejects a date, paymentMethod, and bsvTransactionId change on a confirmed payment, each with 409', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(realTenantId, 'Confirmed Multi-Field Student');
    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
    });

    await expect(
      paymentService.updatePayment(payment.id, realTenantId, { date: new Date('2026-01-01') })
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      paymentService.updatePayment(payment.id, realTenantId, { paymentMethod: 'check' })
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      paymentService.updatePayment(payment.id, realTenantId, { bsvTransactionId: 'fake-txid' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('still allows notes and referenceNumber to update on a confirmed payment', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(realTenantId, 'Confirmed Notes Student');
    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
    });

    const updated = await paymentService.updatePayment(payment.id, realTenantId, {
      notes: 'Paid at front desk',
      referenceNumber: 'RCPT-042',
    });

    expect(updated.notes).toBe('Paid at front desk');
    expect(updated.referenceNumber).toBe('RCPT-042');
    expect(updated.status).toBe('confirmed');
    expect(Number(updated.amount)).toBe(100);
  });

  it('still allows amount and status to be corrected on a pending payment (pre-existing behavior preserved)', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(realTenantId, 'Pending Student');
    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
      status: 'pending',
    });
    expect(payment.status).toBe('pending');

    const updated = await paymentService.updatePayment(payment.id, realTenantId, { amount: 90 });
    expect(Number(updated.amount)).toBe(90);
    expect(updated.status).toBe('pending');
  });

  it('still allows status to be corrected on a failed payment (pre-existing behavior preserved)', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(realTenantId, 'Failed Payment Student');
    const payment = await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
      status: 'failed',
    });
    expect(payment.status).toBe('failed');

    const updated = await paymentService.updatePayment(payment.id, realTenantId, { status: 'pending' });
    expect(updated.status).toBe('pending');
  });

  it('enforces tenant isolation - a payment from another tenant 404s rather than 409ing', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeStudentWithEnrollment(otherTenantId, 'Other Tenant Student');
    const payment = await paymentService.createPayment(otherTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
    });

    await expect(
      paymentService.updatePayment(payment.id, realTenantId, { amount: 50 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

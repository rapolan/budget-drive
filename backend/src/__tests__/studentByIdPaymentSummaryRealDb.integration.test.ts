import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

/**
 * Real-Postgres proof of the payments-actions fix to
 * studentService.getStudentById: a single-student read previously came
 * back with NO top-level paymentSummary at all (only getAllStudents'
 * batched attachProgress computed one, via combinePaymentSummaries) -
 * breaking Payments.tsx's "resolve a who-owes-you row not already in the
 * loaded list" fallback (PaymentModal's amount pre-fill and
 * PaymentHistoryModal's summary strip both read student.paymentSummary).
 * Fixed by computing the same combined (BTW + DE) paymentSummary from the
 * enrollments list getStudentById already fetches - no new query.
 *
 * Gated behind TEST_DATABASE_URL via an early return per test, same
 * convention as every other *RealDb.integration.test.ts file in this repo.
 *
 * To run locally against a real Postgres instance (must already have all
 * migrations applied - run `npm run migrate` against it first):
 *   TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
 *     npx vitest run src/__tests__/studentByIdPaymentSummaryRealDb.integration.test.ts
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

describe('real-Postgres: getStudentById paymentSummary attachment (payments-actions fix)', () => {
  let pool: Pool;
  let studentService: typeof import('../services/studentService');
  let paymentService: typeof import('../services/paymentService');

  let realTenantId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const dbEnv = parseDbUrl(TEST_DATABASE_URL);
    Object.assign(process.env, dbEnv);

    const { vi } = await import('vitest');
    vi.resetModules();
    studentService = await import('../services/studentService');
    paymentService = await import('../services/paymentService');

    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, email, status, plan_tier)
       VALUES ('Student ById PaymentSummary Test School', $1, 'student-by-id-test@example.com', 'active', 'basic')
       RETURNING id`,
      [`student-by-id-test-${Date.now()}`]
    );
    realTenantId = tenantResult.rows[0].id;
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    if (realTenantId) {
      await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [realTenantId]);
    }
    await pool.end();
  });

  afterEach(async () => {
    if (!TEST_DATABASE_URL) return;
    await pool.query('DELETE FROM payments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM enrollments WHERE tenant_id = $1', [realTenantId]);
    await pool.query('DELETE FROM students WHERE tenant_id = $1', [realTenantId]);
  });

  async function makeAdultStudent(label: string) {
    const result = await pool.query(
      `INSERT INTO students (tenant_id, full_name, first_name, last_name, date_of_birth)
       VALUES ($1, $2, $2, 'Test', '1995-01-01')
       RETURNING id`,
      [realTenantId, label]
    );
    return result.rows[0].id as string;
  }

  it('attaches a combined paymentSummary with a real outstanding balance, computed from the enrollment and payment rows already in the database', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeAdultStudent('RealDb Outstanding Student');
    await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required, total_cost)
       VALUES ($1, $2, 'driver_training', 'active', 30, 300.00)`,
      [realTenantId, studentId]
    );

    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 100,
      paymentMethod: 'cash',
    });

    const student = await studentService.getStudentById(studentId, realTenantId);

    expect(student).not.toBeNull();
    expect(student!.paymentSummary).toMatchObject({
      totalPaid: 100,
      outstandingBalance: 200,
      paymentStatus: 'partial',
      creditBalance: 0,
    });
  });

  it('returns no paymentSummary for a student with no enrollments, same as the list endpoint would for this case', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeAdultStudent('RealDb No Enrollment Student');

    const student = await studentService.getStudentById(studentId, realTenantId);

    expect(student).not.toBeNull();
    expect(student!.paymentSummary).toBeUndefined();
  });

  it('shows a positive creditBalance when the student has overpaid, matching the same overpayment math computePaymentSummary already proves elsewhere', async () => {
    if (!TEST_DATABASE_URL) return;

    const studentId = await makeAdultStudent('RealDb Overpaid Student');
    await pool.query(
      `INSERT INTO enrollments (tenant_id, student_id, program_type, status, hours_required, total_cost)
       VALUES ($1, $2, 'driver_training', 'active', 30, 150.00)`,
      [realTenantId, studentId]
    );

    await paymentService.createPayment(realTenantId, {
      studentId,
      amount: 200,
      paymentMethod: 'cash',
    });

    const student = await studentService.getStudentById(studentId, realTenantId);

    expect(student!.paymentSummary).toMatchObject({
      totalPaid: 200,
      outstandingBalance: 0,
      creditBalance: 50,
    });
  });
});

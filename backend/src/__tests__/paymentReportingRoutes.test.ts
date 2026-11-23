import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_A = '11111111-1111-1111-1111-111111111111';

function signToken(userId: string, role?: string, instructorId?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role, instructorId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function asAdmin() {
  // requireRole's fresh DB lookup - caller is an active admin.
  mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
}

describe('payments-phase1 reporting routes - role gating', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor is rejected from GET /payments/period-summary', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/payments/period-summary?start=2026-01-01&end=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from GET /payments/who-owes-you', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/payments/who-owes-you')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from GET /payments/export', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/payments/export?start=2026-01-01&end=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from GET /payments/:id/receipt', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/payments/550e8400-e29b-41d4-a716-446655440000/receipt')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('admin can reach GET /payments/period-summary', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();
    mockQuery.mockResolvedValueOnce(queryResult([{ amount: '0', count: '0' }])); // collected
    mockQuery.mockResolvedValueOnce(queryResult([{ amount: '0', count: '0' }])); // refunded
    mockQuery.mockResolvedValueOnce(queryResult([])); // by method
    mockQuery.mockResolvedValueOnce(queryResult([{ outstanding: '0', credit: '0' }])); // balances

    const res = await request(app)
      .get('/api/v1/payments/period-summary?start=2026-01-01&end=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ start: '2026-01-01', end: '2026-01-31' });
  });
});

describe('GET /payments/period-summary - date range validation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('400s when start/end are missing', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();

    const res = await request(app)
      .get('/api/v1/payments/period-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('400s on a malformed date string', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();

    const res = await request(app)
      .get('/api/v1/payments/period-summary?start=not-a-date&end=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('400s when end is before start', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();

    const res = await request(app)
      .get('/api/v1/payments/period-summary?start=2026-12-31&end=2026-01-01')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /payments/period-summary - tenant isolation and response shape', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('scopes every underlying query to the caller\'s own tenantId', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();
    mockQuery.mockResolvedValueOnce(queryResult([{ amount: '500.00', count: '3' }]));
    mockQuery.mockResolvedValueOnce(queryResult([{ amount: '50.00', count: '1' }]));
    mockQuery.mockResolvedValueOnce(queryResult([{ payment_method: 'cash', amount: '500.00', count: '3' }]));
    mockQuery.mockResolvedValueOnce(queryResult([{ outstanding: '120.00', credit: '0' }]));

    const res = await request(app)
      .get('/api/v1/payments/period-summary?start=2026-01-01&end=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Every query call after the role-check lookup must include TENANT_ID
    // as one of its bound parameters - confirms no query accidentally
    // queries across all tenants.
    const dataQueryCalls = mockQuery.mock.calls.slice(1); // skip requireRole's own lookup
    for (const [, params] of dataQueryCalls) {
      expect(params).toContain(TENANT_ID);
    }

    expect(res.body.data).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
      collected: { amount: 500, count: 3 },
      refunded: { amount: 50, count: 1 },
      net: 450,
      outstanding: 120,
      paidNotYetScheduled: 0,
      collectedByMethod: [{ paymentMethod: 'cash', amount: 500, count: 3 }],
    });
  });
});

describe('GET /payments/who-owes-you - response shape', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes age bucket and last-payment info per row, sorted by amount owed descending', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();

    const today = new Date();
    const old = new Date(today);
    old.setDate(old.getDate() - 90); // > 60 days -> '61+'
    const recent = new Date(today);
    recent.setDate(recent.getDate() - 10); // <= 30 days -> '0-30'

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          enrollment_id: 'enrollment-small',
          student_id: 'student-small',
          student_name: 'Small Owed',
          total_cost: '100.00',
          total_paid: '90.00',
          oldest_date: recent.toISOString(),
          last_payment_date: recent.toISOString(),
          last_payment_amount: '90.00',
        },
        {
          enrollment_id: 'enrollment-big',
          student_id: 'student-big',
          student_name: 'Big Owed',
          total_cost: '500.00',
          total_paid: '50.00',
          oldest_date: old.toISOString(),
          last_payment_date: null,
          last_payment_amount: null,
        },
      ])
    );

    const res = await request(app)
      .get('/api/v1/payments/who-owes-you')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // Sorted highest-owed-first.
    expect(res.body.data[0]).toMatchObject({ studentName: 'Big Owed', amountOwed: 450, ageBucket: '61+' });
    expect(res.body.data[1]).toMatchObject({
      studentName: 'Small Owed',
      amountOwed: 10,
      ageBucket: '0-30',
      lastPaymentAmount: 90,
    });
    expect(res.body.data[0].lastPaymentDate).toBeNull();
  });
});

describe('GET /payments/:id/receipt - not found and tenant scoping', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('404s when the payment does not exist for this tenant', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();
    mockQuery.mockResolvedValueOnce(queryResult([])); // payment lookup, scoped to tenant, finds nothing

    const res = await request(app)
      .get('/api/v1/payments/550e8400-e29b-41d4-a716-446655440000/receipt')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns a deterministic receiptNumber and never guesses which lessons the payment covered', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asAdmin();
    const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440099';
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: PAYMENT_ID,
          date: '2026-03-15',
          amount: '75.00',
          payment_method: 'cash',
          reference_number: null,
          enrollment_id: 'enrollment-1',
          student_id: 'student-1',
          program_type: 'driver_training',
          total_cost: '300.00',
          student_name: 'Jane Doe',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(queryResult([{ lesson_cost_sum: '0' }])); // lesson totals (unused - total_cost override present)
    mockQuery.mockResolvedValueOnce(queryResult([{ total_paid: '75.00' }])); // paid total

    const res = await request(app)
      .get(`/api/v1/payments/${PAYMENT_ID}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.receiptNumber).toMatch(/^BDP-[0-9A-F]{10}$/);
    expect(res.body.data.appliedToProgramType).toBe('driver_training');
    // No per-lesson field anywhere in the payload - "applied to" is the
    // enrollment/program only, never a guessed lesson list.
    expect(res.body.data).not.toHaveProperty('appliedToLessons');
    expect(res.body.data).not.toHaveProperty('coveredLessonIds');
  });
});

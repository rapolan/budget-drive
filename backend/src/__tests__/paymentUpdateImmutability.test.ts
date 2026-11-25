import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440001';

function signToken(userId: string, role: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function asRole(role: string) {
  mockQuery.mockResolvedValueOnce(queryResult([{ role, status: 'active' }]));
}

/**
 * PUT /payments/:id previously let owner/admin/staff flip amount, date,
 * paymentMethod, status, and bsvTransactionId in place on a confirmed
 * payment - bypassing both the append-only payment_adjustments model and
 * the owner/admin-only gate on refund/void. This locks those 5 fields
 * once a payment is confirmed; notes and referenceNumber stay editable
 * regardless of status. pending/failed payments are unaffected - nothing
 * in this codebase relies on this route to transition them
 * (markPaymentAsReceived is the dedicated pending-to-confirmed route).
 */
describe('PUT /payments/:id - locked fields are immutable once confirmed', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('staff gets 409 trying to change amount on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');
    asRole('staff');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'confirmed' }])); // pre-check SELECT

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/amount cannot be changed/i);
  });

  it('admin gets 409 trying to change status on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'confirmed' }])); // pre-check SELECT

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'refunded' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot be changed/i);
  });

  it('admin gets 409 trying to change date on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'confirmed' }]));

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-01-01' });

    expect(res.status).toBe(409);
  });

  it('admin gets 409 trying to change paymentMethod on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'confirmed' }]));

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(409);
  });

  it('admin gets 409 trying to change bsvTransactionId on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'confirmed' }]));

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bsvTransactionId: 'abc123' });

    expect(res.status).toBe(409);
  });

  it('404s instead of 409 when the payment does not exist', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([])); // pre-check SELECT finds nothing

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10 });

    expect(res.status).toBe(404);
  });

  it('notes still update on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    // notes never triggers the pre-check SELECT - a single UPDATE query.
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, status: 'confirmed', notes: 'Paid via Venmo' }])
    );

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Paid via Venmo' });

    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('Paid via Venmo');
  });

  it('referenceNumber still updates on a confirmed payment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'staff');
    asRole('staff');
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, status: 'confirmed', reference_number: 'CHK-100' }])
    );

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceNumber: 'CHK-100' });

    expect(res.status).toBe(200);
    expect(res.body.data.referenceNumber).toBe('CHK-100');
  });

  it('a pending payment can still have its amount corrected (pre-existing behavior preserved)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'pending' }])); // pre-check SELECT
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, status: 'pending', amount: '42.00' }])
    );

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 42 });

    expect(res.status).toBe(200);
  });

  it('a failed payment can still have its status corrected (pre-existing behavior preserved)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');
    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'failed' }])); // pre-check SELECT
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, status: 'pending' }])
    );

    const res = await request(app)
      .put(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending' });

    expect(res.status).toBe(200);
  });
});

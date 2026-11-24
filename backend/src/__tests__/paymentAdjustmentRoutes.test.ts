import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  resetMockClient,
} from './mocks/database';
import { vi } from 'vitest';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ENROLLMENT_ID = '550e8400-e29b-41d4-a716-446655440002';

function signToken(userId: string, role?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function asRole(role: string) {
  mockQuery.mockResolvedValueOnce(queryResult([{ role, status: 'active' }]));
}

describe('POST /payments/:id/adjustments - role gating (owner/admin only, staff gets 403)', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('staff is rejected (403)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');
    asRole('staff');

    const res = await request(app)
      .post(`/api/v1/payments/${PAYMENT_ID}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ adjustmentType: 'refund', amount: 10, reasonCode: 'overpaid' });

    expect(res.status).toBe(403);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('instructor is rejected (403)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor');
    asRole('instructor');

    const res = await request(app)
      .post(`/api/v1/payments/${PAYMENT_ID}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ adjustmentType: 'void', reasonCode: 'overpaid' });

    expect(res.status).toBe(403);
  });

  it('admin can reach the endpoint (full success path)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '0' }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'adj-1', tenant_id: TENANT_ID, payment_id: PAYMENT_ID, adjustment_type: 'refund',
          amount: '25.00', reason_code: 'overpaid', note: null, created_by: 'admin-1',
          created_at: '2026-01-01T00:00:00.000Z', ledger_hash: 'abc', ledger_txid: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post(`/api/v1/payments/${PAYMENT_ID}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ adjustmentType: 'refund', amount: 25, reasonCode: 'overpaid' });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(25);
  });

  it('owner can reach the endpoint', async () => {
    const { default: app } = await import('../app');
    const token = signToken('owner-1', 'owner');
    asRole('owner');

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: PAYMENT_ID, tenant_id: TENANT_ID, amount: '100.00', status: 'confirmed' }]))
      .mockResolvedValueOnce(queryResult([{ total_adjusted: '0' }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'adj-2', tenant_id: TENANT_ID, payment_id: PAYMENT_ID, adjustment_type: 'void',
          amount: '100.00', reason_code: 'entered_in_error', note: null, created_by: 'owner-1',
          created_at: '2026-01-01T00:00:00.000Z', ledger_hash: 'def', ledger_txid: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post(`/api/v1/payments/${PAYMENT_ID}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ adjustmentType: 'void', reasonCode: 'entered_in_error' });

    expect(res.status).toBe(201);
  });

  it('400s when adjustmentType is missing', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    const res = await request(app)
      .post(`/api/v1/payments/${PAYMENT_ID}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reasonCode: 'overpaid' });

    expect(res.status).toBe(400);
  });

  it('400s when reasonCode is missing', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    const res = await request(app)
      .post(`/api/v1/payments/${PAYMENT_ID}/adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ adjustmentType: 'refund', amount: 10 });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /payments/:id - permanently removed, always 409s', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('409s for an admin, pointing at Void', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    const res = await request(app)
      .delete(`/api/v1/payments/${PAYMENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/void/i);
  });
});

describe('POST /enrollments/:id/payment-arrangement - role gating (owner/admin only)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('staff is rejected (403)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');
    asRole('staff');

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/payment-arrangement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'paying $50/month' });

    expect(res.status).toBe(403);
  });

  it('admin can set the arrangement marker', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        payment_arrangement_set_at: '2026-01-01T00:00:00.000Z',
        payment_arrangement_set_by: 'admin-1',
        payment_arrangement_note: 'paying $50/month',
      }])
    );

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/payment-arrangement`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'paying $50/month' });

    expect(res.status).toBe(200);
    expect(res.body.data.note).toBe('paying $50/month');
  });

  it('404s for an unknown enrollment', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .post(`/api/v1/enrollments/${ENROLLMENT_ID}/payment-arrangement`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('DELETE /enrollments/:id/payment-arrangement - role gating (owner/admin only)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('staff is rejected (403)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'staff');
    asRole('staff');

    const res = await request(app)
      .delete(`/api/v1/enrollments/${ENROLLMENT_ID}/payment-arrangement`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('admin can clear the arrangement marker', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');
    asRole('admin');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID }]));

    const res = await request(app)
      .delete(`/api/v1/enrollments/${ENROLLMENT_ID}/payment-arrangement`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

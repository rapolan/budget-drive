import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_UUID = '22222222-2222-2222-2222-222222222222';

function signToken(userId: string, tenantId: string, role = 'admin') {
  return jwt.sign({ userId, tenantId, email: `${userId}@example.com`, role }, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /api/v1/onboarding/status', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns the stored onboarding_completed_at marker for the authenticated tenant', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID, 'admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT_UUID, onboarding_completed_at: '2026-11-10T00:00:00.000Z' }])
    );

    const res = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
    expect(res.body.data.onboardingCompletedAt).toBe('2026-11-10T00:00:00.000Z');
  });

  it('returns null when the tenant has no onboarding_completed_at yet (a brand-new self-service signup)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID, 'admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT_UUID, onboarding_completed_at: null }])
    );

    const res = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
    expect(res.body.data.onboardingCompletedAt).toBeNull();
  });

  it('allows an instructor to read it too - read-only, harmless', async () => {
    const { default: app } = await import('../app');
    const token = signToken('instructor-1', TENANT_UUID, 'instructor');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT_UUID, onboarding_completed_at: null }])
    );

    const res = await request(app)
      .get('/api/v1/onboarding/status')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/onboarding/complete', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('owner can mark onboarding complete', async () => {
    const { default: app } = await import('../app');
    const token = signToken('owner-1', TENANT_UUID, 'owner');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'owner', status: 'active' }])) // requireRole's membership lookup
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_UUID }])); // the UPDATE itself

    const res = await request(app)
      .post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin can mark onboarding complete', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID, 'admin');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_UUID }]));

    const res = await request(app)
      .post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
  });

  it('instructor gets 403 - requireRole(owner, admin) rejects it', async () => {
    const { default: app } = await import('../app');
    const token = signToken('instructor-1', TENANT_UUID, 'instructor');

    // requireRole re-queries the membership fresh from the DB.
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(403);
  });

  it('staff gets 403 too', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', TENANT_UUID, 'staff');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'staff', status: 'active' }]));

    const res = await request(app)
      .post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(403);
  });

  it('is idempotent - calling it twice does not error', async () => {
    const { default: app } = await import('../app');
    const token = signToken('owner-1', TENANT_UUID, 'owner');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'owner', status: 'active' }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_UUID }]));
    const res1 = await request(app)
      .post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);
    expect(res1.status).toBe(200);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ role: 'owner', status: 'active' }]))
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_UUID }]));
    const res2 = await request(app)
      .post('/api/v1/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);
    expect(res2.status).toBe(200);
  });
});

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

// Regression coverage for a real finding: paymentRoutes.ts, certificateRoutes.ts,
// treasuryRoutes.ts, and tenant/user settings routes had NO requireRole gate at
// all before this fix - any authenticated tenant member (instructor included)
// could read/write payments, certificates, treasury, and overwrite tenant
// settings via a direct API call, regardless of what the frontend nav showed.
describe('role gating on financial/admin routers', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('instructor is rejected from GET /payments', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    // requireRole's fresh DB lookup: caller's membership is 'instructor'
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from GET /certificates/worklist', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/certificates/worklist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from GET /treasury/balance', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/treasury/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from PUT /tenant/settings', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .put('/api/v1/tenant/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ businessName: 'Hijacked School Name' });

    expect(res.status).toBe(403);
  });

  it('instructor is rejected from GET /users (team roster)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'instructor', status: 'active' }]));

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('admin can still reach GET /payments', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    // requireRole's fresh DB lookup: caller is an active admin
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin', status: 'active' }]));
    // getAllPayments: count query, then the paginated SELECT
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '0' }]));
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('a route mounted after payments/certificates at the same generic prefix is unaffected by their role gates (regression guard for a router.use() prefix bug found while building this fix)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    // GET /lessons is mounted before payments/certificates and has no role
    // gate of its own - confirms payments'/certificates' new requireRole
    // additions (applied per-route, not via router.use()) don't leak onto
    // unrelated routes sharing the generic API_PREFIX mount. A first attempt
    // at this fix used router.use(requireRole(...)) on these two
    // generically-mounted routers, which incorrectly intercepted every
    // OTHER route mounted afterward at the same prefix (dashboard,
    // calendar-feed, classroom, etc.) - caught by this exact test failing
    // against that version.
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get('/api/v1/lessons')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
// validateUUID('id') gates GET /tenants/:id, so the HTTP-level tests below
// need a real UUID - the other, pre-existing tests in this file use the
// plain 'tenant-1' string as a queryResult() mock field, never as a URL
// param, so they're unaffected.
const TENANT_UUID = '11111111-1111-1111-1111-111111111111';

function signToken(userId: string, tenantId: string, role = 'admin') {
  return jwt.sign(
    { userId, tenantId, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression test: getTenantSettings/updateTenantSettings returned the raw
// snake_case DB row cast (unsafely) to a camelCase TypeScript type, so every
// camelCase field access (e.g. settings.defaultHoursRequired) was silently
// undefined at runtime. Settings.tsx's "Default Hours Required" field had
// no snake_case fallback (unlike its sibling fields), so it always fell
// through to the hardcoded ?? 6 default regardless of what was saved.
describe('tenantService camelCase conversion', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('getTenantSettings returns defaultHoursRequired in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_hours_required: '8.00' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.defaultHoursRequired).toBe('8.00');
    expect((settings as unknown as { default_hours_required?: string }).default_hours_required).toBeUndefined();
  });

  it('updateTenantSettings returns defaultHoursRequired in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_hours_required: '10.00' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { defaultHoursRequired: 10 });

    expect(settings.defaultHoursRequired).toBe('10.00');
  });

  it('getTenantSettings returns standardLessonLengthMinutes in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', standard_lesson_length_minutes: 90 }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.standardLessonLengthMinutes).toBe(90);
    expect((settings as unknown as { standard_lesson_length_minutes?: number }).standard_lesson_length_minutes).toBeUndefined();
  });

  it('updateTenantSettings writes standard_lesson_length_minutes when standardLessonLengthMinutes is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', standard_lesson_length_minutes: 90 }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { standardLessonLengthMinutes: 90 });

    expect(settings.standardLessonLengthMinutes).toBe(90);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/standard_lesson_length_minutes\s*=\s*\$/);
    expect(params).toContain(90);
  });

  it('getTenantSettings returns defaultLessonCost in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_lesson_cost: '175.00' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.defaultLessonCost).toBe('175.00');
    expect((settings as unknown as { default_lesson_cost?: string }).default_lesson_cost).toBeUndefined();
  });

  it('updateTenantSettings writes default_lesson_cost when defaultLessonCost is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', default_lesson_cost: '175.00' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { defaultLessonCost: 175 });

    expect(settings.defaultLessonCost).toBe('175.00');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/default_lesson_cost\s*=\s*\$/);
    expect(params).toContain(175);
  });

  it('getTenantSettings returns maxLessonsPerStudentPerDay in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', max_lessons_per_student_per_day: 2 }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.maxLessonsPerStudentPerDay).toBe(2);
    expect((settings as unknown as { max_lessons_per_student_per_day?: number }).max_lessons_per_student_per_day).toBeUndefined();
  });

  it('updateTenantSettings writes max_lessons_per_student_per_day when maxLessonsPerStudentPerDay is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', max_lessons_per_student_per_day: 2 }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { maxLessonsPerStudentPerDay: 2 });

    expect(settings.maxLessonsPerStudentPerDay).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/max_lessons_per_student_per_day\s*=\s*\$/);
    expect(params).toContain(2);
  });

  // Phase 1 of the compliance-records arc (docs/compliance-records-build-plan.md):
  // the DMV driving school license number, added to the same
  // tenant_settings table/save flow business_name/address already use.
  it('getTenantSettings returns licenseNumber in camelCase', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', license_number: 'E1234' }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.licenseNumber).toBe('E1234');
    expect((settings as unknown as { license_number?: string }).license_number).toBeUndefined();
  });

  it('getTenantSettings returns licenseNumber as null when never set', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', license_number: null }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.licenseNumber).toBeNull();
  });

  it('updateTenantSettings writes license_number when licenseNumber is provided', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', license_number: 'E1234' }])
    );

    const settings = await tenantService.updateTenantSettings('tenant-1', { licenseNumber: 'E1234' });

    expect(settings.licenseNumber).toBe('E1234');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/license_number\s*=\s*\$/);
    expect(params).toContain('E1234');
  });

  // A newly-created tenant's timezone column has no DB default (see
  // backend/database/migrations/011_timezone_default_nullable.sql) - it
  // must round-trip as a real null, not an empty string or the old
  // 'America/Los_Angeles' default, so the frontend can tell "never
  // configured" apart from "explicitly chose Pacific".
  it('getTenantSettings returns timezone as null when never set', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ tenant_id: 'tenant-1', timezone: null }])
    );

    const settings = await tenantService.getTenantSettings('tenant-1');

    expect(settings?.timezone).toBeNull();
  });
});

// Regression test (bug found via a full codebase health audit): unlike
// getTenantSettings above (already correct), getTenantById/getTenantBySlug
// both returned the raw snake_case DB row cast directly (`as
// TenantFullInfo`), with no keysToCamel call - the exact same bug class as
// the already-fixed getTenantSettings/paymentService.ts history, recurring
// in this file. Live via GET /tenant/current (the frontend's TenantContext
// consumer), which calls getTenantById internally.
//
// GET /tenants (list every tenant to any logged-in user) and
// GET /tenants/:id (fetch any tenant by id, no ownership check) were
// removed entirely - a security-audit finding, not a refactor: both had
// only `authenticate`, no `requireRole` and no check that the caller
// belonged to the tenant being read, and a repo-wide grep confirmed zero
// frontend/test/docs/script callers of either. getTenantById itself is
// kept (it backs the live GET /tenant/current route); getAllTenants had no
// remaining caller once its route was removed and was deleted along with
// this describe block's test of it - there is no replacement, since
// listing every tenant to a non-privileged caller has no legitimate use
// case in this single-tenant-per-login app (there is no platform-admin
// role in UserRole).
describe('tenantService.getTenantById/getTenantBySlug camelCase conversion', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('getTenantById returns businessName/planTier/trialEndsAt in camelCase, not snake_case', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'tenant-1',
        plan_tier: 'enterprise',
        trial_ends_at: null,
        business_name: 'Budget Driving School',
        created_at: '2026-08-23T13:08:47.542Z',
      }])
    );

    const tenant = await tenantService.getTenantById('tenant-1');

    expect(tenant?.businessName).toBe('Budget Driving School');
    expect(tenant?.planTier).toBe('enterprise');
    expect(tenant?.createdAt).toBe('2026-08-23T13:08:47.542Z');
    expect((tenant as unknown as { business_name?: string })?.business_name).toBeUndefined();
    expect((tenant as unknown as { plan_tier?: string })?.plan_tier).toBeUndefined();
  });

  it('getTenantBySlug returns businessName in camelCase, not snake_case', async () => {
    const tenantService = await import('../services/tenantService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'tenant-1', slug: 'budget-driving', business_name: 'Budget Driving School' }])
    );

    const tenant = await tenantService.getTenantBySlug('budget-driving');

    expect(tenant?.businessName).toBe('Budget Driving School');
    expect((tenant as unknown as { business_name?: string })?.business_name).toBeUndefined();
  });

  it('GET /api/v1/tenant/current returns camelCase fields in the actual HTTP response shape', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: TENANT_UUID,
        plan_tier: 'enterprise',
        business_name: 'Budget Driving School',
        created_at: '2026-08-23T13:08:47.542Z',
      }])
    );

    const res = await request(app)
      .get('/api/v1/tenant/current')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_UUID);

    expect(res.status).toBe(200);
    expect(res.body.data.businessName).toBe('Budget Driving School');
    expect(res.body.data.planTier).toBe('enterprise');
    expect(res.body.data.business_name).toBeUndefined();
    expect(res.body.data.plan_tier).toBeUndefined();
  });
});

// Security-audit regression guard: GET /tenants, GET /tenants/:id,
// PUT /tenants/:id, and DELETE /tenants/:id all previously existed with
// only `authenticate` (no requireRole, no ownership check) - any logged-in
// user, including an instructor, could list every tenant in the system,
// read any other tenant's full business/contact/subscription info, or
// edit/soft-delete any tenant by guessing/incrementing a UUID. All four
// routes were removed entirely (confirmed via grep: zero callers anywhere
// - frontend, tests, docs, scripts). This test locks that removal in so a
// future change can't accidentally resurrect one of these routes without
// at least this test failing first.
describe('removed legacy tenant-management routes stay gone', () => {
  it('GET /api/v1/tenants no longer exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);
    const res = await request(app).get('/api/v1/tenants').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/tenants/:id no longer exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);
    const res = await request(app).get(`/api/v1/tenants/${TENANT_UUID}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('PUT /api/v1/tenants/:id no longer exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);
    const res = await request(app).put(`/api/v1/tenants/${TENANT_UUID}`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(404);
  });

  it('DELETE /api/v1/tenants/:id no longer exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);
    const res = await request(app).delete(`/api/v1/tenants/${TENANT_UUID}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/tenants no longer exists', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);
    const res = await request(app).post('/api/v1/tenants').set('Authorization', `Bearer ${token}`).send({ name: 'x', slug: 'x', email: 'x@example.com' });
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/auth/register no longer exists', async () => {
    // A valid token is included so this request reaches the real 404
    // handler rather than being intercepted en route by some other
    // router's own unrelated `router.use(authenticate)` (every router
    // mounted on the bare API_PREFIX applies that pair at its own top;
    // an unauthenticated request to any genuinely nonexistent path under
    // that prefix 401s at the first such router it falls through to,
    // before ever reaching the 404 handler - a pre-existing, harmless
    // quirk unrelated to this route's actual removal, not something this
    // test is about).
    const { default: app } = await import('../app');
    const token = signToken('admin-1', TENANT_UUID);
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'a@example.com', password: 'password123', fullName: 'A' });
    expect(res.status).toBe(404);
  });
});

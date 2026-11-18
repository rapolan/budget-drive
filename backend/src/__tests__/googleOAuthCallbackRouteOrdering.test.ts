import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockQuery, resetMockQuery } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockHandleOAuthCallback = vi.fn();
vi.mock('../services/googleCalendarService', () => ({
  buildConsentUrl: vi.fn(),
  handleOAuthCallback: (...args: unknown[]) => mockHandleOAuthCallback(...args),
  getStatus: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../services/googleCalendarSyncService', () => ({
  syncAllUpcomingLessonsForInstructor: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Real integration tests against the actual mounted Express app
 * (supertest, no Authorization header) - unlike
 * googleCalendarController.test.ts, which calls oauthCallback() directly
 * and therefore can never observe a route-registration-order bug (it
 * never goes through app.ts's middleware stack at all).
 *
 * Regression coverage: GET /api/v1/google-calendar/oauth-callback used to
 * be registered in app.ts AFTER several routers (studentRoutes,
 * vehicleRoutes, lessonRoutes, instructorRoutes, among others) that each
 * call router.use(authenticate) as a blanket with no path argument - that
 * middleware runs for EVERY request under /api/v1 that reaches it,
 * rejecting with 401 before Express ever checks whether the path matches
 * one of that router's own routes. Reproduced live in production: the
 * browser landed on a raw {"success":false,"error":"Authentication
 * required. No token provided."} JSON response after the instructor
 * approved on Google's own consent screen, instead of being redirected
 * back to the app.
 */
describe('GET /api/v1/google-calendar/oauth-callback - route registration order', () => {
  beforeEach(() => {
    resetMockQuery();
    mockHandleOAuthCallback.mockReset();
  });

  it('never returns 401, even with no Authorization header at all', async () => {
    const { default: app } = await import('../app');

    const res = await request(app).get('/api/v1/google-calendar/oauth-callback?error=access_denied');

    // This is the actual regression assertion: a request with ZERO auth
    // information must never be rejected by the authenticate middleware
    // for this specific public route. If oauth-callback is ever moved
    // back below a blanket-authenticate router, this becomes a 401 and
    // this test fails - exactly the live production bug.
    expect(res.status).not.toBe(401);
  });

  it('error=access_denied redirects (302) to /my/profile?googleCalendar=denied, not /profile', async () => {
    const { default: app } = await import('../app');

    const res = await request(app).get('/api/v1/google-calendar/oauth-callback?error=access_denied');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/my/profile?googleCalendar=denied');
  });

  it('missing code AND state returns 400 from the handler itself, not a 401 from auth middleware', async () => {
    const { default: app } = await import('../app');

    const res = await request(app).get('/api/v1/google-calendar/oauth-callback');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('missing state only (code present) also returns 400, not a redirect', async () => {
    const { default: app } = await import('../app');

    const res = await request(app).get('/api/v1/google-calendar/oauth-callback?code=some-code');

    expect(res.status).toBe(400);
  });

  it('a valid-looking code+state, with handleOAuthCallback mocked to succeed, redirects (302) to /my/profile?googleCalendar=connected', async () => {
    const { default: app } = await import('../app');
    mockHandleOAuthCallback.mockResolvedValue({ instructorId: 'instructor-1', tenantId: 'tenant-abc' });

    const res = await request(app).get('/api/v1/google-calendar/oauth-callback?code=auth-code&state=signed-state');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/my/profile?googleCalendar=connected');
    expect(mockHandleOAuthCallback).toHaveBeenCalledWith('auth-code', 'signed-state');
  });

  it('a valid-looking code+state, with handleOAuthCallback mocked to throw, redirects (302) to /my/profile?googleCalendar=error', async () => {
    const { default: app } = await import('../app');
    mockHandleOAuthCallback.mockRejectedValue(new Error('invalid or expired state'));

    const res = await request(app).get('/api/v1/google-calendar/oauth-callback?code=auth-code&state=bad-state');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/my/profile?googleCalendar=error');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';

function signToken(userId: string, role: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression coverage for the same class of bug as the invite-link's
// FRONTEND_URL fragility: the calendar feed's baseUrl used to fall back to
// `http://localhost:${PORT}` whenever API_BASE_URL wasn't set - which it
// never was in production, silently producing a feed URL no real
// instructor could subscribe to (confirmed live: returned
// http://localhost:8080/... in production). Fixed by deriving the base
// URL from the incoming request itself (req.protocol + req.get('host')),
// which requires 'trust proxy' to be set so req.protocol correctly
// reports 'https' behind Railway's TLS-terminating reverse proxy.
describe('calendar feed URL construction derives from the request, not env vars', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('POST /feed/setup builds feedUrl from the request Host header, not localhost/PORT', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getOrCreateFeedToken: no existing token
    mockQuery.mockResolvedValueOnce(queryResult([])); // getOrCreateFeedToken: UPDATE

    const res = await request(app)
      .post(`/api/v1/calendar-feed/feed/setup/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Host', 'budget-drive-production.up.railway.app');

    expect(res.status).toBe(200);
    expect(res.body.feedUrl).toMatch(/^http:\/\/budget-drive-production\.up\.railway\.app\/api\/v1\/calendar-feed\/.+\.ics$/);
    expect(res.body.feedUrl).not.toMatch(/localhost/);
  });

  it('POST /feed/setup reports https when X-Forwarded-Proto says https (trust proxy honors it)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getOrCreateFeedToken: no existing token
    mockQuery.mockResolvedValueOnce(queryResult([])); // getOrCreateFeedToken: UPDATE

    const res = await request(app)
      .post(`/api/v1/calendar-feed/feed/setup/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Host', 'budget-drive-production.up.railway.app')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
    expect(res.body.feedUrl).toMatch(/^https:\/\/budget-drive-production\.up\.railway\.app\//);
  });

  it('GET /feed/status also builds feedUrl from the request, not localhost/PORT', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(queryResult([{ calendar_feed_token: 'existing-token-abc' }])); // getFeedToken

    const res = await request(app)
      .get(`/api/v1/calendar-feed/feed/status/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Host', 'budget-drive-production.up.railway.app')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
    expect(res.body.hasCalendarFeed).toBe(true);
    expect(res.body.feedUrl).toBe('https://budget-drive-production.up.railway.app/api/v1/calendar-feed/existing-token-abc.ics');
  });

  it('the unused legacy /url/:instructorId route has been removed', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    const res = await request(app)
      .get(`/api/v1/calendar-feed/url/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('the unused duplicate /regenerate/:instructorId route has been removed (regeneration is feed/setup?regenerate=true)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    const res = await request(app)
      .post(`/api/v1/calendar-feed/regenerate/${INSTRUCTOR_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

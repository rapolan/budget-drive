import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const TOKEN = 'a'.repeat(64);

// Regression coverage: the public .ics endpoint served Content-Disposition:
// attachment (forces a browser download instead of letting Google/Apple
// treat the URL as a live subscription) and Cache-Control: no-store
// (actively fights caching, working against the feed's own
// X-PUBLISHED-TTL/REFRESH-INTERVAL hints instead of complementing them).
describe('GET /calendar-feed/:token.ics - subscription-friendly headers', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('serves Content-Disposition: inline (not attachment) so calendar clients subscribe instead of downloading', async () => {
    const { default: app } = await import('../app');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'instructor-1', tenant_id: TENANT_ID, full_name: 'Priya Patel' }])) // getInstructorByFeedToken
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }])) // generateICSFeed's instructor lookup
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])); // lessons

    const res = await request(app).get(`/api/v1/calendar-feed/${TOKEN}.ics`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect(res.headers['content-disposition']).not.toMatch(/attachment/);
  });

  it('serves a short Cache-Control max-age instead of no-store', async () => {
    const { default: app } = await import('../app');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'instructor-1', tenant_id: TENANT_ID, full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([]));

    const res = await request(app).get(`/api/v1/calendar-feed/${TOKEN}.ics`);

    expect(res.headers['cache-control']).not.toMatch(/no-store/);
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/);
  });
});

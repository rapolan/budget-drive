import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const ENROLLMENT_ID = '33333333-3333-3333-3333-333333333333';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Regression coverage for a real bug found during manual smoke testing:
 * the response's Content-Disposition header (the server-suggested
 * filename) was present on the wire but invisible to frontend JS, because
 * CORS hides every response header from JS except ones explicitly listed
 * in Access-Control-Expose-Headers - and that list only had X-Tenant-ID.
 * enrollmentsApi.getWithdrawalTranscript read `undefined` and silently
 * fell back to a generic "transcript.txt" filename. Fixed by adding
 * Content-Disposition to app.ts's cors() exposedHeaders. This test
 * exercises the real Express app (not a mocked header check) so a future
 * regression in either the route or the CORS config is caught here.
 */
describe('GET /api/v1/enrollments/:id/withdrawal-transcript', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns the transcript as a text/plain download with a real Content-Disposition filename', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'withdrawn',
          completed: false,
          enrollment_date: '2026-01-01',
          withdrawn_at: '2026-06-15T10:00:00.000Z',
          withdrawn_reason: 'Moved out of state',
          student_name: 'Jane Doe',
          date_of_birth: '2010-01-01',
        }])
      ) // enrollment + student join
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])); // lessons

    const res = await request(app)
      .get(`/api/v1/enrollments/${ENROLLMENT_ID}/withdrawal-transcript`)
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="transcript-Jane-Doe-/);
    expect(res.text).toContain('Jane Doe');

    // The actual regression: Content-Disposition must be in the CORS
    // exposed-headers list, or frontend JS reads it as undefined even
    // though it's genuinely present on the wire.
    const exposedHeaders = res.headers['access-control-expose-headers'] || '';
    expect(exposedHeaders).toContain('Content-Disposition');
  });

  it('404s for an enrollment that does not exist', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const res = await request(app)
      .get(`/api/v1/enrollments/${ENROLLMENT_ID}/withdrawal-transcript`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

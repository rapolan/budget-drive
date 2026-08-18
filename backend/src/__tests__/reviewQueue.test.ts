import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

vi.mock('../services/treasuryService', () => ({
  default: { createTransaction: vi.fn() },
}));
vi.mock('../services/Ledger', () => ({
  ledger: { anchorAction: vi.fn() },
}));
vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Fixtures are built relative to the real current time (never a fixed
// calendar date) so the suite stays correct regardless of when it runs -
// avoids fake-timer interaction with the DB pool/date-fns-tz internals.
function utcDateHoursAgo(hours: number): { date: string; time: string } {
  const instant = new Date(Date.now() - hours * 60 * 60 * 1000);
  return {
    date: instant.toISOString().slice(0, 10),
    time: instant.toISOString().slice(11, 19),
  };
}

describe('dashboardService.getLessonsNeedingReview', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('excludes lessons whose end time has not passed yet', async () => {
    const { getLessonsNeedingReview } = await import('../services/dashboardService');

    // UTC timezone keeps date/time math trivial for this fixture - end time
    // is 2 hours in the future.
    const future = utcDateHoursAgo(-2);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone: 'UTC' }])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([
          {
            id: 'lesson-future',
            studentId: 'student-1',
            studentName: 'Jane Doe',
            instructorId: 'instructor-1',
            instructorName: 'Sam Instructor',
            date: future.date,
            startTime: future.time,
            endTime: future.time,
          },
        ])
      );

    const days = await getLessonsNeedingReview(TENANT_ID);

    expect(days).toHaveLength(0);
  });

  it('groups past-due lessons by day, most overdue first, and flags a day overdue past 24h', async () => {
    const { getLessonsNeedingReview } = await import('../services/dashboardService');

    const wayOverdue = utcDateHoursAgo(72); // 3 days ago - definitely >24h overdue
    const recentlyEnded = utcDateHoursAgo(2); // 2 hours ago - not yet overdue

    mockQuery
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone: 'UTC' }])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([
          {
            id: 'lesson-old',
            studentId: 'student-1',
            studentName: 'Old Student',
            instructorId: 'instructor-1',
            instructorName: 'Sam Instructor',
            date: wayOverdue.date,
            startTime: wayOverdue.time,
            endTime: wayOverdue.time,
          },
          {
            id: 'lesson-today',
            studentId: 'student-2',
            studentName: 'Today Student',
            instructorId: 'instructor-1',
            instructorName: 'Sam Instructor',
            date: recentlyEnded.date,
            startTime: recentlyEnded.time,
            endTime: recentlyEnded.time,
          },
        ])
      );

    const days = await getLessonsNeedingReview(TENANT_ID);

    expect(days).toHaveLength(2);
    // Most overdue day (earliest date) sorts first.
    expect(days[0].date <= days[1].date).toBe(true);

    const oldDay = days.find(d => d.lessons.some(l => l.id === 'lesson-old'));
    const todayDay = days.find(d => d.lessons.some(l => l.id === 'lesson-today'));

    expect(oldDay?.overdue).toBe(true);
    expect(todayDay?.overdue).toBe(false);
  });

  it('scopes to a single instructor when instructorId is provided', async () => {
    const { getLessonsNeedingReview } = await import('../services/dashboardService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone: 'UTC' }]))
      .mockResolvedValueOnce(queryResult([]));

    await getLessonsNeedingReview(TENANT_ID, 'instructor-9');

    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/l\.instructor_id = \$2/);
    expect(params).toEqual([TENANT_ID, 'instructor-9']);
  });
});

describe('GET /api/v1/dashboard/review-queue', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns grouped days and a flat total count', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const wayOverdue = utcDateHoursAgo(72);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone: 'UTC' }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            id: 'lesson-old',
            studentId: 'student-1',
            studentName: 'Old Student',
            instructorId: 'instructor-1',
            instructorName: 'Sam Instructor',
            date: wayOverdue.date,
            startTime: wayOverdue.time,
            endTime: wayOverdue.time,
          },
        ])
      );

    const res = await request(app)
      .get('/api/v1/dashboard/review-queue')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(1);
    expect(res.body.data.days).toHaveLength(1);
    expect(res.body.data.days[0].overdue).toBe(true);
  });
});

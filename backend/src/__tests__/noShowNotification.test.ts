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

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: unknown[]) => mockValidateLessonBooking(...args),
}));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';
const LESSON_ID = 'lesson-1';
const NOTIFICATION_ID = '55555555-5555-5555-5555-555555555555';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('no-show notification creation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('marking a lesson no-show creates a follow_up_due notification owned by the acting user', async () => {
    const { noShowLesson } = await import('../services/lessonService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'scheduled' }])
    ); // assertLessonReviewable's getLessonById
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'no_show' }])
    ); // UPDATE lessons
    mockQuery.mockResolvedValueOnce(queryResult([{ full_name: 'Jane Doe' }])); // student name lookup
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: NOTIFICATION_ID, tenant_id: TENANT_ID, user_id: 'staff-1', type: 'follow_up_due' }])
    ); // INSERT notification

    await noShowLesson(LESSON_ID, TENANT_ID, 'staff-1');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;
    expect(sql).toMatch(/follow_up_due/);
    expect(params).toContain('staff-1');
    expect(params).toContain(STUDENT_ID);
  });

  it('booking a new lesson dismisses any active no-show notification for that student', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }])); // explicit vehicle check

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: LESSON_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        instructor_id: INSTRUCTOR_ID,
        vehicle_id: 'vehicle-explicit',
        cost: 0,
        status: 'scheduled',
      }])
    ); // insert lesson

    mockQuery.mockResolvedValueOnce(queryResult([])); // dismissal UPDATE

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      vehicleId: 'vehicle-explicit',
      date: '2026-08-03',
      startTime: '10:00:00',
      endTime: '12:00:00',
      duration: 120,
      cost: 0,
    });

    const dismissCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE notifications')
    );
    expect(dismissCall).toBeDefined();
    const [sql, params] = dismissCall!;
    expect(sql).toMatch(/is_read = true/);
    expect(params).toContain(STUDENT_ID);
  });
});

describe('GET /api/v1/dashboard/no-show-alerts', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('lists students with an active undismissed no-show notification', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        studentId: STUDENT_ID,
        studentName: 'Jane Doe',
        noShowDate: '2026-08-01',
        notificationId: NOTIFICATION_ID,
      }])
    );

    const res = await request(app)
      .get('/api/v1/dashboard/no-show-alerts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].studentId).toBe(STUDENT_ID);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/is_read = false/);
  });
});

describe('POST /api/v1/dashboard/alerts/:notificationId/dismiss', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('dismisses a notification scoped to the caller\'s tenant', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: NOTIFICATION_ID }]));

    const res = await request(app)
      .post(`/api/v1/dashboard/alerts/${NOTIFICATION_ID}/dismiss`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE notifications/);
    expect(sql).toMatch(/tenant_id = \$2/);
    expect(params).toEqual([NOTIFICATION_ID, TENANT_ID]);
  });
});

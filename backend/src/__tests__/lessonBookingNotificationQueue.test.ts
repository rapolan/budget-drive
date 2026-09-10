import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

// Regression coverage for the notification_queue table having no migration
// anywhere in the repo (bug found via a full codebase health audit):
// lessonService.createLesson's own INSERTs into notification_queue never
// actually failed loudly (wrapped in try/catch, logged as a non-blocking
// warn), so every booking confirmation/reminder had silently never been
// queued. Migration 033_add_notification_queue.sql restores the table;
// these tests pin that createLesson actually writes the rows it always
// claimed to, and that GET /notifications/history genuinely succeeds
// against real data instead of 500ing on the missing relation.

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

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('booking a lesson queues notification_queue rows (bug: table had no migration)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates booking_confirmation and reminder rows for both student and instructor', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      ) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }])); // explicit vehicle check

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation - no completed DE
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          vehicle_id: 'vehicle-explicit',
          cost: 0, // 0 so the treasury-split block is skipped, isolating this test to notification queueing
          status: 'scheduled',
        }])
      ); // insert lesson

    // Email lookups feeding the notification_queue inserts (run right after
    // the lesson INSERT, before the calendar-invite/no-show-dismissal calls
    // further down createLesson).
    mockQuery
      .mockResolvedValueOnce(queryResult([{ email: 'student@example.com', full_name: 'Jane Doe' }])) // student email
      .mockResolvedValueOnce(queryResult([{ email: 'instructor@example.com' }])); // instructor email

    // Booking confirmation (student), 24h reminder (student), 1h reminder
    // (student), booking confirmation (instructor), 24h reminder (instructor)
    // - a real future date makes both reminder windows still in the future,
    // so all 5 inserts fire (lessonService has no instructor 1h-reminder
    // branch at all - a pre-existing asymmetry, not part of this bug).
    mockQuery
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    // Calendar invite is mocked to resolve false with no DB call (see
    // vi.mock('../services/lessonInviteService') above), so the next real
    // query is the no-show dismissal UPDATE.
    mockQuery.mockResolvedValueOnce(queryResult([])); // no-show notification dismissal UPDATE

    const farFutureDate = new Date();
    farFutureDate.setFullYear(farFutureDate.getFullYear() + 1);
    const dateStr = farFutureDate.toISOString().split('T')[0];

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      vehicleId: 'vehicle-explicit',
      date: dateStr,
      startTime: '10:00:00',
      endTime: '12:00:00',
      duration: 120,
      cost: 0,
    });

    const insertCalls = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO notification_queue')
    );
    expect(insertCalls).toHaveLength(5);

    const types = insertCalls.map(([, params]) => (params as unknown[])[2]);
    expect(types).toEqual(
      expect.arrayContaining(['booking_confirmation', 'reminder_24h', 'reminder_1h'])
    );

    const recipientTypes = insertCalls.map(([, params]) => (params as unknown[])[4]);
    expect(recipientTypes).toContain('student');
    expect(recipientTypes).toContain('instructor');

    // Every insert enumerates exactly the columns notificationQueueService/
    // notificationProcessor actually read - this is the full column set
    // migration 033 was derived from, not a guessed minimal schema.
    for (const [sql] of insertCalls) {
      expect(sql).toMatch(/tenant_id, lesson_id, notification_type, recipient_email, recipient_type/);
      expect(sql).toMatch(/scheduled_send_time, status, created_at, updated_at/);
    }
  });
});

describe('GET /api/v1/notifications/history (bug: notification_queue had no migration, this always 500\'d)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns 200 with real queued-notification data, not a 500 on a missing relation', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1', 'admin');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: 'notif-1',
          tenant_id: TENANT_ID,
          lesson_id: LESSON_ID,
          notification_type: 'booking_confirmation',
          recipient_email: 'student@example.com',
          recipient_type: 'student',
          scheduled_send_time: '2026-09-01T10:00:00.000Z',
          sent_at: '2026-09-01T10:00:05.000Z',
          status: 'sent',
          attempt_count: 1,
          error_message: null,
          lesson_date: '2026-09-02',
          start_time: '10:00:00',
          student_name: 'Jane Doe',
          student_email: 'student@example.com',
          instructor_name: 'John Smith',
          instructor_email: 'instructor@example.com',
          created_at: '2026-08-30T00:00:00.000Z',
        }])
      ) // history SELECT
      .mockResolvedValueOnce(
        queryResult([{ total_sent: '1', total_failed: '0', total_pending: '0', total_notifications: '1' }])
      ); // stats

    const res = await request(app)
      .get('/api/v1/notifications/history')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', TENANT_ID);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'notif-1',
      notificationType: 'booking_confirmation',
      studentName: 'Jane Doe',
      status: 'sent',
    });
    expect(res.body.stats).toMatchObject({
      totalSent: 1,
      totalFailed: 0,
      totalPending: 0,
      totalNotifications: 1,
    });

    // The bug this regression-guards: the original route SQL referenced
    // lessons.lesson_date (never a real column - the real column is
    // lessons.date), which only surfaced once notification_queue itself
    // existed to reach this far. Confirm the query aliases it correctly.
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/l\.date as lesson_date/);
  });
});

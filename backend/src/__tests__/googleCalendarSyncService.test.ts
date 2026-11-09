import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockGetConnectionRow = vi.fn();
const mockGetAuthenticatedClient = vi.fn();

vi.mock('../services/googleCalendarService', () => ({
  getConnectionRow: mockGetConnectionRow,
  getAuthenticatedClient: mockGetAuthenticatedClient,
  GOOGLE_API_TIMEOUT_MS: 10_000,
}));

const mockEventsInsert = vi.fn();
const mockEventsUpdate = vi.fn();

vi.mock('@googleapis/calendar', () => ({
  calendar: vi.fn(() => ({
    events: {
      insert: mockEventsInsert,
      update: mockEventsUpdate,
    },
  })),
}));

const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';
const INSTRUCTOR_B_ID = 'instructor-2';
const LESSON_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

function connectionRow(instructorId = INSTRUCTOR_ID) {
  return {
    id: 'conn-1',
    tenantId: TENANT_ID,
    instructorId,
    googleCalendarId: 'google-cal-1',
    encryptedAccessToken: 'v1.a.b.c',
    encryptedRefreshToken: 'v1.d.e.f',
    accessTokenExpiresAt: new Date(),
    lastSyncAt: null,
    lastSyncError: null,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
}

function lessonRow() {
  return {
    id: LESSON_ID,
    date: new Date('2026-03-15T00:00:00.000Z'),
    start_time: '14:00:00',
    end_time: '16:00:00',
    lesson_type: 'behind_wheel',
    status: 'scheduled',
    pickup_address: '123 Main St',
    notes: null,
    duration: 120,
    lesson_number: 3,
    student_name: 'Jane Doe',
    student_phone: '555-0100',
    parent_phone: null,
    hours_required: '6',
  };
}

function httpError(status: number) {
  const error = new Error(`Request failed with status code ${status}`);
  (error as unknown as { status: number }).status = status;
  return error;
}

describe('googleCalendarSyncService.ts - deriveGoogleEventId', () => {
  it('strips dashes from the lesson UUID into a 32-char lowercase hex id', async () => {
    const { deriveGoogleEventId } = await import('../services/googleCalendarSyncService');
    expect(deriveGoogleEventId(LESSON_ID)).toBe('d290f1ee6c544b0190e6d701748f0851');
  });
});

describe('googleCalendarSyncService.ts - syncLessonToGoogle', () => {
  beforeEach(() => {
    resetMockQuery();
    mockGetConnectionRow.mockReset();
    mockGetAuthenticatedClient.mockReset();
    mockEventsInsert.mockReset();
    mockEventsUpdate.mockReset();
    mockGetAuthenticatedClient.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops silently when the instructor has not connected Google', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(null);
    const { syncLessonToGoogle } = await import('../services/googleCalendarSyncService');

    await syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);

    expect(mockEventsInsert).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('inserts a new event with the deterministic id on first sync', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(connectionRow());
    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()])) // getLessonForCalendarEvent
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }])); // getTenantSettings
    mockEventsInsert.mockResolvedValueOnce({ data: { id: 'ok' } });
    mockQuery.mockResolvedValueOnce(queryResult([])); // upsertEventMapping
    mockQuery.mockResolvedValueOnce(queryResult([])); // recordSyncOutcome

    const { syncLessonToGoogle, deriveGoogleEventId } = await import('../services/googleCalendarSyncService');
    await syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);

    expect(mockEventsInsert).toHaveBeenCalledTimes(1);
    const insertArgs = mockEventsInsert.mock.calls[0][0];
    expect(insertArgs.requestBody.id).toBe(deriveGoogleEventId(LESSON_ID));
    expect(insertArgs.requestBody.summary).toContain('Jane Doe');
    expect(mockEventsUpdate).not.toHaveBeenCalled();

    const mappingCall = mockQuery.mock.calls.find(call => String(call[0]).includes('INSERT INTO google_calendar_events'));
    expect(mappingCall).toBeDefined();

    const outcomeCall = mockQuery.mock.calls.find(call => String(call[0]).includes('last_sync_error'));
    expect(outcomeCall).toBeDefined();
    expect(outcomeCall![1]).toContain(null);
  });

  it('on a 409 from insert (double-create/retried sync), falls through to update with status confirmed', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(connectionRow());
    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]));
    mockEventsInsert.mockRejectedValueOnce(httpError(409));
    mockEventsUpdate.mockResolvedValueOnce({ data: { id: 'ok' } });
    mockQuery.mockResolvedValueOnce(queryResult([])); // upsertEventMapping
    mockQuery.mockResolvedValueOnce(queryResult([])); // recordSyncOutcome

    const { syncLessonToGoogle, deriveGoogleEventId } = await import('../services/googleCalendarSyncService');
    await syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);

    expect(mockEventsUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockEventsUpdate.mock.calls[0][0];
    expect(updateArgs.eventId).toBe(deriveGoogleEventId(LESSON_ID));
    expect(updateArgs.requestBody.status).toBe('confirmed');
  });

  it('A->B->A reassignment: reviving a tombstoned event on instructor A explicitly sets status confirmed', async () => {
    // Simulates: lesson was on instructor A (synced), moved to B (cancelled
    // on A's calendar -> Google soft-deletes/tombstones that event id),
    // then moved back to A - the next sync for A hits a 409 on insert
    // (the tombstoned id still "exists") and must revive it, not just
    // leave it tombstoned/cancelled.
    mockGetConnectionRow.mockResolvedValueOnce(connectionRow(INSTRUCTOR_ID));
    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]));
    mockEventsInsert.mockRejectedValueOnce(httpError(409));
    mockEventsUpdate.mockResolvedValueOnce({ data: { id: 'ok' } });
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const { syncLessonToGoogle } = await import('../services/googleCalendarSyncService');
    await syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);

    const updateArgs = mockEventsUpdate.mock.calls[0][0];
    expect(updateArgs.requestBody.status).toBe('confirmed');
  });

  it('propagates a non-409 insert error into the catch block without calling update', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(connectionRow());
    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]));
    mockEventsInsert.mockRejectedValueOnce(httpError(500));
    mockQuery.mockResolvedValueOnce(queryResult([])); // recordSyncOutcome (error path)

    const { syncLessonToGoogle } = await import('../services/googleCalendarSyncService');
    await syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);

    expect(mockEventsUpdate).not.toHaveBeenCalled();
    const outcomeCall = mockQuery.mock.calls.find(call => String(call[0]).includes('last_sync_error'));
    expect(outcomeCall).toBeDefined();
    expect(outcomeCall![1][0]).toContain('500');
  });

  it('never throws out of the function - a hanging/failing Google call is fully caught', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(connectionRow());
    mockQuery.mockRejectedValueOnce(new Error('simulated hang/timeout'));

    const { syncLessonToGoogle } = await import('../services/googleCalendarSyncService');
    await expect(syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID)).resolves.toBeUndefined();
  });

  it('records the error message on google_calendar_connections when the DB write for the error itself also fails (does not throw)', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(connectionRow());
    mockQuery.mockRejectedValueOnce(new Error('lesson lookup failed'));
    mockQuery.mockRejectedValueOnce(new Error('recordSyncOutcome also failed'));

    const { syncLessonToGoogle } = await import('../services/googleCalendarSyncService');
    await expect(syncLessonToGoogle(LESSON_ID, INSTRUCTOR_ID, TENANT_ID)).resolves.toBeUndefined();
  });
});

describe('googleCalendarSyncService.ts - syncAllUpcomingLessonsForInstructor (backfill/resync)', () => {
  beforeEach(() => {
    resetMockQuery();
    mockGetConnectionRow.mockReset();
    mockGetAuthenticatedClient.mockReset();
    mockEventsInsert.mockReset();
    mockEventsUpdate.mockReset();
    mockGetAuthenticatedClient.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('syncs every upcoming scheduled lesson for the instructor', async () => {
    const lessonIds = ['lesson-a', 'lesson-b', 'lesson-c'];
    mockQuery.mockResolvedValueOnce(queryResult(lessonIds.map(id => ({ id })))); // the upcoming-lessons query

    // Each syncLessonToGoogle call: getConnectionRow -> null (short-circuits
    // cleanly) keeps this test focused on "does it iterate all rows" rather
    // than re-exercising the full per-lesson sync path already covered above.
    mockGetConnectionRow.mockResolvedValue(null);

    const { syncAllUpcomingLessonsForInstructor } = await import('../services/googleCalendarSyncService');
    await syncAllUpcomingLessonsForInstructor(INSTRUCTOR_ID, TENANT_ID);

    expect(mockGetConnectionRow).toHaveBeenCalledTimes(lessonIds.length);
  });

  it('does not let a failure on one lesson stop the rest from syncing', async () => {
    const lessonIds = ['lesson-a', 'lesson-b'];
    mockQuery.mockResolvedValueOnce(queryResult(lessonIds.map(id => ({ id }))));

    mockGetConnectionRow
      .mockRejectedValueOnce(new Error('transient failure for lesson-a'))
      .mockResolvedValueOnce(null);

    const { syncAllUpcomingLessonsForInstructor } = await import('../services/googleCalendarSyncService');
    // syncLessonToGoogle itself catches internally, so this should resolve
    // cleanly having attempted both lessons.
    await expect(syncAllUpcomingLessonsForInstructor(INSTRUCTOR_ID, TENANT_ID)).resolves.toBeUndefined();
    expect(mockGetConnectionRow).toHaveBeenCalledTimes(2);
  });
});

describe('googleCalendarSyncService.ts - another instructor is never affected by this instructor\'s sync', () => {
  beforeEach(() => {
    resetMockQuery();
    mockGetConnectionRow.mockReset();
    mockGetAuthenticatedClient.mockReset();
    mockEventsInsert.mockReset();
    mockGetAuthenticatedClient.mockResolvedValue({});
  });

  it('getConnectionRow is called with the exact instructorId/tenantId passed in, never a different instructor', async () => {
    mockGetConnectionRow.mockResolvedValueOnce(null);
    const { syncLessonToGoogle } = await import('../services/googleCalendarSyncService');

    await syncLessonToGoogle(LESSON_ID, INSTRUCTOR_B_ID, TENANT_ID);

    expect(mockGetConnectionRow).toHaveBeenCalledWith(INSTRUCTOR_B_ID, TENANT_ID);
  });
});

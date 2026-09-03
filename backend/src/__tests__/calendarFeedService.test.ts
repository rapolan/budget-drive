import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';

// Regression coverage: generateICSFeed used to hardcode a VTIMEZONE block
// for America/Los_Angeles regardless of the tenant's actual configured
// zone (X-WR-TIMEZONE too) - every instructor's calendar subscription
// claimed Pacific Time no matter where the school actually was.
describe('generateICSFeed - tenant-timezone-aware, no hardcoded Pacific', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('never emits a VTIMEZONE block or a hardcoded America/Los_Angeles TZID', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }])) // instructor lookup
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{
        id: 'lesson-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        start_time: '14:00:00',
        end_time: '16:00:00',
        lesson_type: 'behind_wheel',
        status: 'scheduled',
        pickup_address: null,
        notes: null,
        duration: 120,
        lesson_number: 3,
        student_name: 'Jane Doe',
        student_phone: '555-0100',
        parent_phone: null,
        hours_required: '6',
      }])); // lessons

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    expect(ics).not.toMatch(/BEGIN:VTIMEZONE/);
    expect(ics).not.toMatch(/TZID=America\/Los_Angeles/);
    expect(ics).not.toMatch(/TZID:America\/Los_Angeles/);
  });

  it('sets X-WR-TIMEZONE to the tenant\'s actual configured zone', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    expect(ics).toMatch(/X-WR-TIMEZONE:America\/New_York/);
  });

  it('emits DTSTART/DTEND as UTC instants reflecting the tenant wall-clock time (America/New_York, EDT UTC-4)', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([{
        id: 'lesson-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        start_time: '14:00:00',
        end_time: '16:00:00',
        lesson_type: 'behind_wheel',
        status: 'scheduled',
        pickup_address: null,
        notes: null,
        duration: 120,
        lesson_number: null,
        student_name: 'Jane Doe',
        student_phone: '555-0100',
        parent_phone: null,
        hours_required: '6',
      }]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    // 2pm-4pm Eastern (EDT, UTC-4) on 2026-03-15 -> 18:00-20:00 UTC.
    expect(ics).toMatch(/DTSTART:20260315T180000Z/);
    expect(ics).toMatch(/DTEND:20260315T200000Z/);
  });

  it('falls back to the documented default timezone when the tenant has none configured', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([])) // no tenant_settings row
      .mockResolvedValueOnce(queryResult([]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    expect(ics).toMatch(/X-WR-TIMEZONE:America\/Los_Angeles/);
  });
});

function lessonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson-1',
    date: new Date('2026-03-15T00:00:00.000Z'),
    start_time: '14:00:00',
    end_time: '16:00:00',
    lesson_type: 'behind_wheel',
    status: 'scheduled',
    pickup_address: null,
    notes: null,
    duration: 120,
    lesson_number: 3,
    student_name: 'Jane Doe',
    student_phone: '555-0100',
    parent_phone: null,
    hours_required: '6',
    ...overrides,
  };
}

// Regression coverage: the lessons query filtered WHERE l.status IN
// ('scheduled', 'completed') - a cancelled lesson never reached the
// STATUS:CANCELLED-emitting code below it at all, so it silently vanished
// from the feed's SQL result instead of being emitted with an explicit
// cancellation. Some calendar clients leave a stale "ghost" event behind
// when a previously-seen UID just disappears from the feed rather than
// being told to cancel - an admin cancellation must actually reach the
// subscriber's calendar as a removal, not a silent gap.
describe('generateICSFeed - cancellation reaches the subscribed calendar', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes a cancelled lesson in the query and emits it with STATUS:CANCELLED, keeping the same UID', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([lessonRow({ id: 'lesson-cancelled-1', status: 'cancelled' })]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    // The query itself must actually fetch cancelled rows - not filter
    // them out before the STATUS:CANCELLED logic ever runs.
    const [sql] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/'cancelled'/);

    expect(ics).toMatch(/UID:lesson-lesson-cancelled-1@budgetdrivingschool\.com/);
    expect(ics).toMatch(/STATUS:CANCELLED/);
    // Never both - a cancelled lesson must not also claim CONFIRMED.
    expect(ics).not.toMatch(/STATUS:CONFIRMED/);
  });

  it('a no_show lesson stays visible as a normal CONFIRMED event, not cancelled', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([lessonRow({ id: 'lesson-noshow-1', status: 'no_show' })]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    const [sql] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/'no_show'/);

    expect(ics).toMatch(/UID:lesson-lesson-noshow-1@budgetdrivingschool\.com/);
    expect(ics).toMatch(/STATUS:CONFIRMED/);
    expect(ics).not.toMatch(/STATUS:CANCELLED/);
  });

  it('a scheduled lesson alongside a cancelled one each get their own correct status in the same feed', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([
        lessonRow({ id: 'lesson-active', status: 'scheduled' }),
        lessonRow({ id: 'lesson-gone', status: 'cancelled' }),
      ]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    const activeEventMatch = ics.match(/UID:lesson-lesson-active@[\s\S]*?END:VEVENT/);
    const cancelledEventMatch = ics.match(/UID:lesson-lesson-gone@[\s\S]*?END:VEVENT/);
    expect(activeEventMatch![0]).toMatch(/STATUS:CONFIRMED/);
    expect(cancelledEventMatch![0]).toMatch(/STATUS:CANCELLED/);
  });
});

// Refresh promptness: a subscription feed is pull-only, so without a hint
// Google may only re-poll about once a day, leaving a cancellation stale
// on the instructor's calendar for up to that long.
describe('generateICSFeed - refresh hints', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('emits X-PUBLISHED-TTL and REFRESH-INTERVAL of one hour on the VCALENDAR', async () => {
    const { generateICSFeed } = await import('../services/calendarFeedService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ full_name: 'Priya Patel' }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }]))
      .mockResolvedValueOnce(queryResult([]));

    const ics = await generateICSFeed(INSTRUCTOR_ID, TENANT_ID);

    expect(ics).toMatch(/X-PUBLISHED-TTL:PT1H/);
    expect(ics).toMatch(/REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  });
});

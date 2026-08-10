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

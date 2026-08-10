import { describe, it, expect } from 'vitest';
import { formatDate, generateICSContent, type LessonInviteData } from '../services/lessonInviteService';

// Regression coverage: formatDate used to construct `new Date(dateStr +
// 'T12:00:00')` ("Add time to avoid timezone issues") and the ICS content
// hardcoded a VTIMEZONE block for America/Los_Angeles regardless of the
// tenant's actual configured zone - every exported invite claimed Pacific
// Time no matter where the school actually was. Both are now driven by the
// tenant-timezone helper module (item 1).

function baseInviteData(overrides: Partial<LessonInviteData> = {}): LessonInviteData {
  return {
    lessonId: 'lesson-1',
    studentName: 'Jane Doe',
    studentPhone: '555-0100',
    instructorName: 'Priya Patel',
    instructorEmail: 'priya@example.com',
    lessonDate: '2026-03-15',
    startTime: '14:00',
    endTime: '16:00',
    lessonType: 'behind_wheel',
    duration: 120,
    lessonNumber: 3,
    hoursRequired: 6,
    pickupAddress: '123 Main St',
    tenantName: 'Budget Driving School',
    timezone: 'America/Los_Angeles',
    ...overrides,
  };
}

describe('formatDate - tenant-timezone-aware, no T12:00:00 hack', () => {
  it('formats a date string as a readable weekday/month/day/year in the tenant timezone', () => {
    expect(formatDate('2026-03-15', 'America/Los_Angeles')).toBe('Sunday, March 15, 2026');
  });

  it('produces the same calendar date across different timezones for the same date string (no UTC-midnight roll)', () => {
    // The old `new Date(dateStr + 'T12:00:00')` hack existed specifically
    // to avoid a UTC-midnight parse rolling the date back a day in
    // negative-UTC-offset zones. Confirm the fix doesn't reintroduce that
    // for a zone far from UTC in either direction.
    expect(formatDate('2026-03-15', 'Pacific/Kiritimati')).toBe('Sunday, March 15, 2026'); // UTC+14
    expect(formatDate('2026-03-15', 'America/Los_Angeles')).toBe('Sunday, March 15, 2026'); // UTC-7/8
  });

  it('resolves correctly for a non-Pacific tenant (America/New_York)', () => {
    expect(formatDate('2026-12-25', 'America/New_York')).toBe('Friday, December 25, 2026');
  });
});

describe('generateICSContent - UTC DTSTART/DTEND, no hardcoded Pacific VTIMEZONE', () => {
  it('never emits a VTIMEZONE block or a hardcoded America/Los_Angeles TZID', () => {
    const ics = generateICSContent(baseInviteData());
    expect(ics).not.toMatch(/BEGIN:VTIMEZONE/);
    expect(ics).not.toMatch(/TZID=America\/Los_Angeles/);
    expect(ics).not.toMatch(/TZID:America\/Los_Angeles/);
  });

  it('emits DTSTART/DTEND as UTC instants (Z-suffixed, RFC-5545-legal) reflecting the tenant wall-clock time', () => {
    // 2pm-4pm Pacific on 2026-03-15 is PDT (spring-forward already passed
    // on 2026-03-08), so UTC-7 -> 21:00-23:00 UTC.
    const ics = generateICSContent(baseInviteData());
    expect(ics).toMatch(/DTSTART:20260315T210000Z/);
    expect(ics).toMatch(/DTEND:20260315T230000Z/);
  });

  it('resolves the correct UTC instant for a non-Pacific tenant (America/New_York, EDT UTC-4)', () => {
    const ics = generateICSContent(baseInviteData({ timezone: 'America/New_York' }));
    expect(ics).toMatch(/DTSTART:20260315T180000Z/);
    expect(ics).toMatch(/DTEND:20260315T200000Z/);
  });

  it('resolves the correct UTC instant for a no-DST tenant (America/Phoenix, fixed UTC-7)', () => {
    const ics = generateICSContent(baseInviteData({ timezone: 'America/Phoenix', lessonDate: '2026-07-15' }));
    expect(ics).toMatch(/DTSTART:20260715T210000Z/);
    expect(ics).toMatch(/DTEND:20260715T230000Z/);
  });

  it('a 2pm lesson stays a 2pm-wall-clock event across a DST shift (Constraint A rationale)', () => {
    // Before spring-forward: PST (UTC-8) -> 22:00 UTC. After: PDT (UTC-7) -> 21:00 UTC.
    const beforeDst = generateICSContent(baseInviteData({ lessonDate: '2026-03-01' }));
    const afterDst = generateICSContent(baseInviteData({ lessonDate: '2026-03-15' }));
    expect(beforeDst).toMatch(/DTSTART:20260301T220000Z/);
    expect(afterDst).toMatch(/DTSTART:20260315T210000Z/);
  });
});

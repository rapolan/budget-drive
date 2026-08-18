import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-local-time';
const INSTRUCTOR_ID = 'instructor-1';

const SCHEDULING_SETTINGS_ROW = {
  id: 'settings-1',
  tenant_id: TENANT_ID,
  buffer_time_between_lessons: 30,
  buffer_time_before_first_lesson: 0,
  buffer_time_after_last_lesson: 0,
  min_hours_advance_booking: 0,
  max_days_advance_booking: 90,
  default_lesson_duration: 120,
  default_max_students_per_day: 3,
  lesson_duration_templates: null,
  allow_back_to_back_lessons: false,
  default_work_start_time: '09:00:00',
  default_work_end_time: '17:00:00',
  created_at: new Date(),
  updated_at: new Date(),
};

function mockSlotsSequence(tenantSettingsRow: Record<string, unknown>, availability: unknown[]) {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce(queryResult([tenantSettingsRow])) // getTenantSettings (timezone)
    .mockResolvedValueOnce(queryResult([SCHEDULING_SETTINGS_ROW])) // getSchedulingSettings
    .mockResolvedValueOnce(queryResult(availability)) // instructor_availability
    .mockResolvedValueOnce(queryResult([])) // time off
    .mockResolvedValueOnce(queryResult([])); // lessons
}

// A slot's startTimeLocal/endTimeLocal must be genuinely independent
// representations from its startTime/endTime ISO instants - the frontend
// reads *Local directly rather than parsing the ISO instant with the
// browser's own getHours() (see docs/ARCHITECTURE.md §7).
describe('findAvailableSlots - startTimeLocal/endTimeLocal', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns tenant wall-clock HH:MM fields distinct from the ISO instant fields', async () => {
    const { findAvailableSlots } = await import('../services/schedulingService');

    mockSlotsSequence(
      { id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/New_York' },
      [{ instructor_id: INSTRUCTOR_ID, day_of_week: 1, start_time: '09:00:00', end_time: '11:00:00', max_students: 3 }]
    );

    const slots = await findAvailableSlots({
      tenantId: TENANT_ID,
      instructorId: INSTRUCTOR_ID,
      startDate: new Date('2026-08-03T12:00:00Z'),
      endDate: new Date('2026-08-03T12:00:00Z'),
      duration: 120,
    });

    expect(slots.length).toBeGreaterThan(0);
    const slot = slots[0];

    expect(slot.startTimeLocal).toBe('09:00');
    expect(slot.endTimeLocal).toBe('11:00');

    // The ISO instant must parse to a DIFFERENT hour than the local fields -
    // 09:00 America/New_York (EDT, UTC-4 in August) is 13:00 UTC.
    const isoHour = new Date(slot.startTime).getUTCHours();
    expect(isoHour).toBe(13);
    expect(String(isoHour).padStart(2, '0')).not.toBe(slot.startTimeLocal.split(':')[0]);
  });

  it('startTimeLocal/endTimeLocal are unaffected by which timezone the ISO instant would display in', async () => {
    const { findAvailableSlots } = await import('../services/schedulingService');

    mockSlotsSequence(
      { id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' },
      [{ instructor_id: INSTRUCTOR_ID, day_of_week: 1, start_time: '09:00:00', end_time: '11:00:00', max_students: 3 }]
    );

    const slots = await findAvailableSlots({
      tenantId: TENANT_ID,
      instructorId: INSTRUCTOR_ID,
      startDate: new Date('2026-08-03T12:00:00Z'),
      endDate: new Date('2026-08-03T12:00:00Z'),
      duration: 120,
    });

    expect(slots.length).toBeGreaterThan(0);
    // Same tenant wall-clock window (09:00-11:00) as the America/New_York
    // case above, but a different tenant timezone - startTimeLocal must
    // still read the tenant's own wall clock, not shift with the zone.
    expect(slots[0].startTimeLocal).toBe('09:00');
    expect(slots[0].endTimeLocal).toBe('11:00');
  });
});

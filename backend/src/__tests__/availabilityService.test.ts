import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';

// Regression coverage: updateSchedulingSettings used to run a plain
// UPDATE and throw AppError(404, 'Scheduling settings not found') for any
// tenant with no scheduling_settings row yet - which, before
// createTenantWithOwner was fixed to insert one, was EVERY brand-new
// tenant. getSchedulingSettings (the read path) already lazily created
// this row on first GET; the update path didn't, so a new school's first
// save in the onboarding wizard's Defaults step (buffer-between-lessons)
// failed outright if they hadn't already triggered a GET first.
describe('availabilityService.updateSchedulingSettings - missing-row hazard', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates the default row and retries when no row exists yet, instead of throwing 404', async () => {
    const { updateSchedulingSettings } = await import('../services/availabilityService');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // initial UPDATE matches nothing
      .mockResolvedValueOnce(queryResult([])) // INSERT ... ON CONFLICT DO NOTHING
      .mockResolvedValueOnce(queryResult([{
        id: 'row-1',
        tenant_id: TENANT_ID,
        buffer_time_between_lessons: 20,
        default_lesson_duration: 120,
        buffer_time_before_first_lesson: 0,
        buffer_time_after_last_lesson: 0,
        min_hours_advance_booking: 24,
        max_days_advance_booking: 60,
        default_max_students_per_day: 3,
        allow_back_to_back_lessons: false,
        default_work_start_time: '07:00:00',
        default_work_end_time: '20:00:00',
        lesson_duration_templates: [],
      }])); // retry UPDATE succeeds

    const result = await updateSchedulingSettings(TENANT_ID, { bufferTimeBetweenLessons: 20 });

    expect(result.bufferTimeBetweenLessons).toBe(20);
    expect(mockQuery).toHaveBeenCalledTimes(3);

    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO scheduling_settings/);
    expect(insertCall[0]).toMatch(/ON CONFLICT \(tenant_id\) DO NOTHING/);
    expect(insertCall[1]).toEqual([TENANT_ID]);

    const retryUpdateCall = mockQuery.mock.calls[2];
    expect(retryUpdateCall[0]).toMatch(/UPDATE scheduling_settings SET/);
  });

  it('updates directly without creating a row when one already exists', async () => {
    const { updateSchedulingSettings } = await import('../services/availabilityService');

    mockQuery.mockResolvedValueOnce(queryResult([{
      id: 'row-1',
      tenant_id: TENANT_ID,
      buffer_time_between_lessons: 30,
      default_lesson_duration: 120,
      buffer_time_before_first_lesson: 0,
      buffer_time_after_last_lesson: 0,
      min_hours_advance_booking: 24,
      max_days_advance_booking: 60,
      default_max_students_per_day: 3,
      allow_back_to_back_lessons: false,
      default_work_start_time: '07:00:00',
      default_work_end_time: '20:00:00',
      lesson_duration_templates: [],
    }]));

    const result = await updateSchedulingSettings(TENANT_ID, { bufferTimeBetweenLessons: 30 });

    expect(result.bufferTimeBetweenLessons).toBe(30);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('still throws for an empty update payload (unrelated to the missing-row fix)', async () => {
    const { updateSchedulingSettings } = await import('../services/availabilityService');

    await expect(updateSchedulingSettings(TENANT_ID, {})).rejects.toThrow('No fields to update');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

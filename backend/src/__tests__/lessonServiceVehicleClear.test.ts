import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: any[]) => mockValidateLessonBooking(...args),
}));

vi.mock('../services/treasuryService', () => ({
  default: { createTransaction: vi.fn() },
}));

vi.mock('../services/Ledger', () => ({
  ledger: { anchorAction: vi.fn() },
}));

const TENANT_ID = 'tenant-abc';
const LESSON_ID = 'lesson-1';

// Regression coverage for lessons.vehicle_id becoming nullable
// (004_optional_vehicle_details / the earlier 003 migration for lessons):
// updateLesson's vehicle existence check ran unconditionally whenever
// vehicleId !== undefined, including when the caller explicitly passed
// null to CLEAR a vehicle assignment - `SELECT id FROM vehicles WHERE id
// = NULL` never matches, so clearing always 404'd with "Vehicle not
// found," even though null is exactly what the caller asked to persist.
describe('lessonService.updateLesson - clearing vehicleId back to null', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
    mockValidateLessonBooking.mockResolvedValue({ valid: true, conflicts: [] });
  });

  it('sets vehicle_id to null without running the vehicle-existence check', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: 'student-1',
          instructor_id: 'instructor-1',
          vehicle_id: 'vehicle-1',
          date: '2026-08-03',
          start_time: '10:00:00',
          end_time: '12:00:00',
          status: 'scheduled',
        }])
      )
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings, via resolveTimezone
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          vehicle_id: null,
          status: 'scheduled',
        }])
      );

    const result = await updateLesson(LESSON_ID, TENANT_ID, { vehicleId: null });

    expect(result.vehicleId).toBeNull();

    // No SELECT against vehicles should have run - a null vehicleId means
    // "clear the assignment," not "look up this vehicle."
    const vehicleLookupCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('SELECT id FROM vehicles')
    );
    expect(vehicleLookupCall).toBeUndefined();

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE lessons')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/vehicle_id/);
    expect(params).toContain(null);
  });

  it('still validates a real vehicleId and 404s if it does not belong to the tenant', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: 'student-1',
          instructor_id: 'instructor-1',
          vehicle_id: null,
          date: '2026-08-03',
          start_time: '10:00:00',
          end_time: '12:00:00',
          status: 'scheduled',
        }])
      )
      .mockResolvedValueOnce(queryResult([])); // vehicle not found

    await expect(
      updateLesson(LESSON_ID, TENANT_ID, { vehicleId: 'someone-elses-vehicle' })
    ).rejects.toThrow(/vehicle not found/i);
  });

  it('assigns a real vehicle to a previously vehicle-less lesson', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: 'student-1',
          instructor_id: 'instructor-1',
          vehicle_id: null,
          date: '2026-08-03',
          start_time: '10:00:00',
          end_time: '12:00:00',
          status: 'scheduled',
        }])
      )
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-new' }])) // vehicle found
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings, via resolveTimezone
      .mockResolvedValueOnce(
        queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, vehicle_id: 'vehicle-new', status: 'scheduled' }])
      );

    const result = await updateLesson(LESSON_ID, TENANT_ID, { vehicleId: 'vehicle-new' });

    expect(result.vehicleId).toBe('vehicle-new');
  });
});

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

vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';

describe('lessonService.createLesson - vehicle auto-assignment', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
  });

  it('auto-assigns the instructor\'s own vehicle when they have one, and rejects if it\'s double-booked', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-instructor-owned' }])); // instructor-owned vehicle lookup

    mockValidateLessonBooking.mockResolvedValueOnce({
      valid: false,
      conflicts: [{ type: 'vehicle_busy', message: 'Vehicle is already assigned to another lesson' }],
    });

    await expect(
      createLesson(TENANT_ID, {
        studentId: STUDENT_ID,
        instructorId: INSTRUCTOR_ID,
        // vehicleId intentionally omitted
        date: '2026-08-03',
        startTime: '10:00:00',
        endTime: '12:00:00',
        duration: 120,
        cost: 0,
      })
    ).rejects.toThrow(/vehicle is already assigned/i);

    expect(mockValidateLessonBooking).toHaveBeenCalledWith(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      'vehicle-instructor-owned',
      expect.any(Date),
      expect.any(Date)
    );

    // No school-owned fallback query should have run - the instructor has their own vehicle
    const schoolOwnedCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('school_owned') && sql.includes('NOT EXISTS')
    );
    expect(schoolOwnedCall).toBeUndefined();
  });

  it('with two school cars and car A booked at the requested time, auto-assigns car B', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // no instructor-owned vehicle
      .mockResolvedValueOnce(queryResult([{ id: 'car-A' }, { id: 'car-B' }])) // school-owned vehicles exist
      .mockResolvedValueOnce(queryResult([{ id: 'car-B' }])); // available (no overlap) -> car B (car A excluded by the query itself)

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation - no completed DE
      .mockResolvedValueOnce(
        queryResult([{
          id: 'lesson-1',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          vehicle_id: 'car-B',
          cost: 0,
          status: 'scheduled',
        }])
      ); // insert

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      date: '2026-08-03',
      startTime: '10:00:00',
      endTime: '12:00:00',
      duration: 120,
      cost: 0,
    });

    expect(mockValidateLessonBooking).toHaveBeenCalledWith(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      'car-B',
      expect.any(Date),
      expect.any(Date)
    );

    // Confirm the fallback query excludes vehicles with an overlapping lesson,
    // not just LIMIT 1 on an unfiltered list
    const overlapAwareCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('school_owned') && sql.includes('NOT EXISTS')
    );
    expect(overlapAwareCall).toBeDefined();
    expect(overlapAwareCall![1]).toEqual([TENANT_ID, '2026-08-03', '10:00:00', '12:00:00']);
  });

  it('with both school cars busy at the requested time, the booking fails with vehicle_busy', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // no instructor-owned vehicle
      .mockResolvedValueOnce(queryResult([{ id: 'car-A' }, { id: 'car-B' }])) // school-owned vehicles DO exist
      .mockResolvedValueOnce(queryResult([])); // but none are available - both busy at this time

    await expect(
      createLesson(TENANT_ID, {
        studentId: STUDENT_ID,
        instructorId: INSTRUCTOR_ID,
        date: '2026-08-03',
        startTime: '10:00:00',
        endTime: '12:00:00',
        duration: 120,
        cost: 0,
      })
    ).rejects.toThrow(/vehicle is already assigned/i);

    // The booking is rejected outright once every school-owned vehicle is
    // confirmed busy - it never reaches validateLessonBooking with a stale
    // or null vehicleId
    expect(mockValidateLessonBooking).not.toHaveBeenCalled();
  });

  it('books without a vehicle when the tenant has no school-owned vehicles at all (unchanged fallback)', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // no instructor-owned vehicle
      .mockResolvedValueOnce(queryResult([])); // no school-owned vehicles exist in the tenant at all

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation - no completed DE
      .mockResolvedValueOnce(
        queryResult([{
          id: 'lesson-1',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          vehicle_id: null,
          cost: 0,
          status: 'scheduled',
        }])
      ); // insert

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      date: '2026-08-03',
      startTime: '10:00:00',
      endTime: '12:00:00',
      duration: 120,
      cost: 0,
    });

    expect(mockValidateLessonBooking).toHaveBeenCalledWith(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      null,
      expect.any(Date),
      expect.any(Date)
    );

    // The overlap-filtered NOT EXISTS query should never run since there
    // were no school-owned vehicles to check in the first place
    const overlapAwareCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('NOT EXISTS')
    );
    expect(overlapAwareCall).toBeUndefined();
  });

  it('does not query for a default vehicle when one is explicitly provided', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }])); // explicit vehicle check

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation - no completed DE
      .mockResolvedValueOnce(
        queryResult([{
          id: 'lesson-1',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          vehicle_id: 'vehicle-explicit',
          cost: 0,
          status: 'scheduled',
        }])
      ); // insert

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

    const defaultVehicleCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('instructor_owned')
    );
    expect(defaultVehicleCall).toBeUndefined();
  });
});

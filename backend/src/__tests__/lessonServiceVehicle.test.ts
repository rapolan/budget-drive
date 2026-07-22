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

  it('auto-assigns the instructor\'s default vehicle when none is provided, and rejects a double-booked one', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-default' }])); // auto-assign default vehicle lookup

    // validateLessonBooking (mocked) reports the auto-assigned vehicle as busy
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

    // Confirm validateLessonBooking was called with the auto-assigned vehicle, not null
    expect(mockValidateLessonBooking).toHaveBeenCalledWith(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      'vehicle-default',
      expect.any(Date),
      expect.any(Date)
    );

    // Confirm the auto-assignment query prefers the instructor's own vehicle,
    // falling back to school-owned
    const defaultVehicleCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('instructor_owned')
    );
    expect(defaultVehicleCall).toBeDefined();
    expect(defaultVehicleCall![1]).toEqual([TENANT_ID, INSTRUCTOR_ID]);
  });

  it('does not query for a default vehicle when one is explicitly provided', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }])); // explicit vehicle check

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery.mockResolvedValueOnce(
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

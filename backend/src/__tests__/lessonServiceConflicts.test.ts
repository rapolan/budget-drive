import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import { AppError } from '../middleware/errorHandler';

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
const VEHICLE_ID = 'vehicle-1';

describe('lessonService.createLesson - structured conflict propagation', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
  });

  it('the thrown AppError carries the original SchedulingConflict[] from validateLessonBooking', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: VEHICLE_ID }])); // explicit vehicle check

    const conflicts = [
      { type: 'instructor_busy', message: 'Instructor already has a lesson during this time', conflictingLessonId: 'lesson-existing' },
    ];
    mockValidateLessonBooking.mockResolvedValueOnce({ valid: false, conflicts });

    let caught: unknown;
    try {
      await createLesson(TENANT_ID, {
        studentId: STUDENT_ID,
        instructorId: INSTRUCTOR_ID,
        vehicleId: VEHICLE_ID,
        date: '2026-08-03',
        startTime: '10:00:00',
        endTime: '12:00:00',
        duration: 120,
        cost: 0,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(409);
    expect((caught as AppError).conflicts).toEqual(conflicts);
  });

  it('the standalone vehicle-busy throw (all school vehicles busy) also carries a vehicle_busy conflict', async () => {
    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // no instructor-owned vehicle
      .mockResolvedValueOnce(queryResult([{ id: 'car-A' }, { id: 'car-B' }])) // school-owned vehicles exist
      .mockResolvedValueOnce(queryResult([])); // none available - both busy

    let caught: unknown;
    try {
      await createLesson(TENANT_ID, {
        studentId: STUDENT_ID,
        instructorId: INSTRUCTOR_ID,
        date: '2026-08-03',
        startTime: '10:00:00',
        endTime: '12:00:00',
        duration: 120,
        cost: 0,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).conflicts).toEqual([
      { type: 'vehicle_busy', message: 'Vehicle is already assigned to another lesson' },
    ]);
  });
});

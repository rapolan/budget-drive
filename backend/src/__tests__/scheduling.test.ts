import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';
const STUDENT_ID = 'student-1';
const VEHICLE_ID = 'vehicle-1';

const SETTINGS_ROW = {
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

const AVAILABLE_ROW = { id: 'avail-1', start_time: '09:00:00', end_time: '17:00:00' };

/**
 * checkSchedulingConflicts issues these queries in order (with vehicleId and
 * studentId both provided):
 *   1. getSchedulingSettings -> SELECT scheduling_settings
 *   2. availability check
 *   3. time-off check
 *   4. instructor-overlap check
 *   5. buffer-violation check
 *   6. vehicle lookup (ownership_type)
 *   7. vehicle-overlap check (only if vehicle is school-owned / no owner)
 *   8. student-overlap check
 *
 * Each test configures only the calls relevant to what it wants to assert;
 * unlisted calls default to "no rows" (no conflict) via the fallback below.
 */
function mockConflictSequence(overrides: Partial<{
  availability: any[];
  timeOff: any[];
  instructorOverlap: any[];
  bufferViolation: any[];
  vehicleLookup: any[];
  vehicleOverlap: any[];
  studentOverlap: any[];
}> = {}) {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce(queryResult([SETTINGS_ROW])) // getSchedulingSettings
    .mockResolvedValueOnce(queryResult(overrides.availability ?? [AVAILABLE_ROW])) // availability
    .mockResolvedValueOnce(queryResult(overrides.timeOff ?? [])) // time off
    .mockResolvedValueOnce(queryResult(overrides.instructorOverlap ?? [])) // instructor overlap
    .mockResolvedValueOnce(queryResult(overrides.bufferViolation ?? [])) // buffer violation
    .mockResolvedValueOnce(queryResult(overrides.vehicleLookup ?? [{ ownership_type: 'school_owned', owner_instructor_id: null }])) // vehicle lookup
    .mockResolvedValueOnce(queryResult(overrides.vehicleOverlap ?? [])) // vehicle overlap
    .mockResolvedValueOnce(queryResult(overrides.studentOverlap ?? [])); // student overlap
}

describe('scheduling conflict detection', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('detects instructor already booked (instructor_busy)', async () => {
    const { checkSchedulingConflicts } = await import('../services/schedulingService');
    mockConflictSequence({ instructorOverlap: [{ id: 'lesson-existing' }] });

    const conflicts = await checkSchedulingConflicts(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );

    expect(conflicts).toContainEqual(
      expect.objectContaining({ type: 'instructor_busy', conflictingLessonId: 'lesson-existing' })
    );
  });

  it('detects vehicle already booked (vehicle_busy)', async () => {
    const { checkSchedulingConflicts } = await import('../services/schedulingService');
    mockConflictSequence({ vehicleOverlap: [{ id: 'lesson-vehicle-conflict' }] });

    const conflicts = await checkSchedulingConflicts(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );

    expect(conflicts).toContainEqual(
      expect.objectContaining({ type: 'vehicle_busy', conflictingLessonId: 'lesson-vehicle-conflict' })
    );
  });

  it('detects student already booked (student_busy)', async () => {
    const { checkSchedulingConflicts } = await import('../services/schedulingService');
    mockConflictSequence({ studentOverlap: [{ id: 'lesson-student-conflict' }] });

    const conflicts = await checkSchedulingConflicts(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );

    expect(conflicts).toContainEqual(
      expect.objectContaining({ type: 'student_busy', conflictingLessonId: 'lesson-student-conflict' })
    );
  });

  it('detects buffer-time violation (allowBackToBackLessons: false)', async () => {
    const { checkSchedulingConflicts } = await import('../services/schedulingService');
    mockConflictSequence({ bufferViolation: [{ id: 'lesson-too-close' }] });

    const conflicts = await checkSchedulingConflicts(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );

    expect(conflicts).toContainEqual(
      expect.objectContaining({ type: 'buffer_violation', conflictingLessonId: 'lesson-too-close' })
    );
  });

  it('detects instructor time-off collision (time_off)', async () => {
    const { checkSchedulingConflicts } = await import('../services/schedulingService');
    mockConflictSequence({
      timeOff: [{ id: 'timeoff-1', start_time: null, end_time: null }],
    });

    const conflicts = await checkSchedulingConflicts(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );

    expect(conflicts).toContainEqual(
      expect.objectContaining({ type: 'time_off', conflictingTimeOffId: 'timeoff-1' })
    );
  });

  it('reports no conflicts on the happy path', async () => {
    const { checkSchedulingConflicts, validateLessonBooking } = await import('../services/schedulingService');
    mockConflictSequence();

    const conflicts = await checkSchedulingConflicts(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );
    expect(conflicts).toEqual([]);

    mockConflictSequence();
    const result = await validateLessonBooking(
      TENANT_ID,
      INSTRUCTOR_ID,
      STUDENT_ID,
      VEHICLE_ID,
      new Date('2026-08-03T10:00:00'),
      new Date('2026-08-03T12:00:00')
    );
    expect(result).toEqual({ valid: true, conflicts: [] });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: unknown[]) => mockValidateLessonBooking(...args),
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

function mockThroughToInsert() {
  mockQuery
    .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
    .mockResolvedValueOnce(queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])) // active driver_training enrollment
    .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
    .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings (timezone)
    .mockResolvedValueOnce(queryResult([{ id: VEHICLE_ID }])); // explicit vehicle check
  mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });
}

// Phase 3 of the compliance-records arc: a per-lesson discount for
// students who completed the school's own (internal) driver_education,
// applied authoritatively at booking time - never a client-side estimate.
describe('lessonService.createLesson - driver_education discount', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
  });

  it('applies no discount when the student has no completed driver_education enrollment', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToInsert();

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation - none
      .mockResolvedValueOnce(
        queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '70.00', de_discount_applied: null, status: 'scheduled' }])
      );

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID, instructorId: INSTRUCTOR_ID, vehicleId: VEHICLE_ID,
      date: '2026-08-03', startTime: '10:00:00', endTime: '12:00:00', duration: 120, cost: 70,
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons'));
    const [, params] = insertCall!;
    expect(params).toContain(70); // cost unchanged
    expect(params).toContain(null); // de_discount_applied null
  });

  it('subtracts tenant_settings.de_discount_amount from cost when the student has a completed internal driver_education enrollment', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToInsert();

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'de-enrollment-1' }])) // hasCompletedInternalDriverEducation - found
      .mockResolvedValueOnce(queryResult([{ de_discount_amount: '5.00' }])) // getTenantSettings for the discount amount
      .mockResolvedValueOnce(
        queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '65.00', de_discount_applied: '5.00', status: 'scheduled' }])
      );

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID, instructorId: INSTRUCTOR_ID, vehicleId: VEHICLE_ID,
      date: '2026-08-03', startTime: '10:00:00', endTime: '12:00:00', duration: 120, cost: 70,
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons'));
    const [sql, params] = insertCall!;
    expect(sql).toMatch(/de_discount_applied/);
    expect(params).toContain(65); // 70 - 5
    expect(params).toContain(5); // deDiscountApplied
  });

  it('never produces a negative cost - the discount is capped at the requested cost', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToInsert();

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'de-enrollment-1' }])) // has completed internal DE
      .mockResolvedValueOnce(queryResult([{ de_discount_amount: '50.00' }])) // discount larger than the lesson cost
      .mockResolvedValueOnce(
        queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '0.00', de_discount_applied: '10.00', status: 'scheduled' }])
      );

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID, instructorId: INSTRUCTOR_ID, vehicleId: VEHICLE_ID,
      date: '2026-08-03', startTime: '10:00:00', endTime: '12:00:00', duration: 120, cost: 10,
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons'));
    const [, params] = insertCall!;
    expect(params).toContain(0); // floored at 0, not -40
    expect(params).toContain(10); // deDiscountApplied capped to the requested cost
  });

  it('applies the discount even when the admin manually edited the cost field, against whatever value was actually sent', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToInsert();

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'de-enrollment-1' }]))
      .mockResolvedValueOnce(queryResult([{ de_discount_amount: '5.00' }]))
      .mockResolvedValueOnce(
        queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '95.00', de_discount_applied: '5.00', status: 'scheduled' }])
      );

    // Admin manually raised the price to 100 in the confirm step
    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID, instructorId: INSTRUCTOR_ID, vehicleId: VEHICLE_ID,
      date: '2026-08-03', startTime: '10:00:00', endTime: '12:00:00', duration: 120, cost: 100,
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons'));
    const [, params] = insertCall!;
    expect(params).toContain(95); // 100 - 5, not the default-cost-based 65
  });

  it('applies no discount when tenant_settings.de_discount_amount is 0', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockThroughToInsert();

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: 'de-enrollment-1' }]))
      .mockResolvedValueOnce(queryResult([{ de_discount_amount: '0.00' }]))
      .mockResolvedValueOnce(
        queryResult([{ id: 'lesson-1', tenant_id: TENANT_ID, cost: '70.00', de_discount_applied: null, status: 'scheduled' }])
      );

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID, instructorId: INSTRUCTOR_ID, vehicleId: VEHICLE_ID,
      date: '2026-08-03', startTime: '10:00:00', endTime: '12:00:00', duration: 120, cost: 70,
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons'));
    const [, params] = insertCall!;
    expect(params).toContain(70);
    expect(params).toContain(null);
  });
});

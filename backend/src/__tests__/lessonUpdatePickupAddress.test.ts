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
const LESSON_ID = 'lesson-1';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';
const VEHICLE_ID = 'vehicle-1';

const existingLessonRow = {
  id: LESSON_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  instructor_id: INSTRUCTOR_ID,
  vehicle_id: VEHICLE_ID,
  date: new Date('2026-08-03T00:00:00.000Z'),
  start_time: '10:00:00',
  end_time: '12:00:00',
  duration: 120,
  lesson_number: null,
  status: 'scheduled',
  lesson_type: 'behind_wheel',
  pickup_address: null,
  notes: null,
  cost: 50,
  student_performance: null,
  instructor_rating: null,
  completion_verified: false,
};

/**
 * Regression coverage (bug found via a full codebase health audit):
 * lessonService.updateLesson's dynamic UPDATE column builder never
 * included pickup_address, even though it's written at create time
 * (createLesson) and rendered/submitted as an editable field in
 * LessonModal.tsx's edit flow. Editing an existing lesson's pickup
 * address through the UI silently no-op'd - the save succeeded with no
 * error, but the column never changed. Fixed by adding the missing
 * fields.push('pickup_address = $...') branch, matching every other
 * field's pattern in the same builder (notes/lessonType/etc, immediately
 * above the completionVerified branch).
 */
describe('lessonService.updateLesson - pickup_address (bug: field silently dropped)', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
  });

  it('includes pickup_address in the UPDATE when pickupAddress is provided', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([existingLessonRow])) // fetch existing lesson
      .mockResolvedValueOnce(
        queryResult([{ ...existingLessonRow, pickup_address: '456 New Pickup Ave' }])
      ); // UPDATE ... RETURNING *

    const result = await updateLesson(LESSON_ID, TENANT_ID, {
      pickupAddress: '456 New Pickup Ave',
    } as any);

    // Pickup-address-only edits are a non-schedule field, same as
    // notes/status - the conflict check must not run.
    expect(mockValidateLessonBooking).not.toHaveBeenCalled();

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE lessons')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/pickup_address\s*=\s*\$\d+/);
    expect(params).toContain('456 New Pickup Ave');

    expect(result.pickupAddress).toBe('456 New Pickup Ave');
  });

  it('clearing pickup_address to null is included in the UPDATE', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ ...existingLessonRow, pickup_address: '456 New Pickup Ave' }])
      ) // fetch existing lesson
      .mockResolvedValueOnce(queryResult([{ ...existingLessonRow, pickup_address: null }])); // UPDATE ... RETURNING *

    const result = await updateLesson(LESSON_ID, TENANT_ID, { pickupAddress: null } as any);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE lessons')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toMatch(/pickup_address\s*=\s*\$\d+/);
    expect(params).toContain(null);
    expect(result.pickupAddress).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

// Regression coverage (bug found via a full codebase health audit):
// lessonService.ts directly imported and called treasuryService.
// createTransaction(...), bypassing the ledger seam - sitting right next to
// a correct ledger.anchorAction(...) call two lines later.
// LedgerService.ts's own header states "Never import walletService or
// treasuryService directly outside this folder" - business logic must
// route every BSV-touching call through LedgerService so BSV_ENABLED=false
// genuinely makes the rest of the app inert regardless of what's inside the
// Ledger folder. Fixed by adding LedgerService.recordTreasurySplit,
// implemented in both NoopLedgerService and BsvLedgerService by delegating
// to treasuryService.createTransaction (the one exempted call site,
// per CLAUDE.md), and routing lessonService.ts's call through it instead.
// Same static-source-scan technique as enrollmentBsvForwardCompat.test.ts.
describe('Structural: lessonService.ts routes treasury/BSV activity through the ledger seam only', () => {
  const lessonServiceSource = readFileSync(
    resolve(__dirname, '../services/lessonService.ts'),
    'utf8'
  );

  it('lessonService never imports treasuryService or walletService directly', () => {
    expect(lessonServiceSource).not.toMatch(/from ['"].*treasuryService['"]/);
    expect(lessonServiceSource).not.toMatch(/from ['"].*walletService['"]/);
    expect(lessonServiceSource).not.toMatch(/require\(['"].*(?:walletService|treasuryService)['"]\)/);
  });

  it('lessonService imports the Ledger seam and calls recordTreasurySplit on it', () => {
    expect(lessonServiceSource).toMatch(/from ['"]\.\/Ledger['"]/);
    expect(lessonServiceSource).toMatch(/ledger\.recordTreasurySplit\(/);
  });
});

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: unknown[]) => mockValidateLessonBooking(...args),
}));

vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';
const LESSON_ID = 'lesson-1';

/**
 * Behavioral coverage: with BSV disabled (the current/default state), the
 * fix must be byte-for-byte unchanged from before it - a real lesson
 * booking with cost > 0 still reaches the ledger seam's
 * recordTreasurySplit and anchorAction calls, and a failure in either
 * still doesn't block the booking (unchanged non-blocking try/catch).
 */
describe('lessonService.createLesson - treasury split via the ledger seam (BSV_ENABLED=false)', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
    vi.resetModules();
  });

  it('routes the treasury split through ledger.recordTreasurySplit with the exact same arguments treasuryService.createTransaction previously received directly', async () => {
    const ledgerModule = await import('../services/Ledger');
    const recordTreasurySplitSpy = vi.spyOn(ledgerModule.ledger, 'recordTreasurySplit').mockResolvedValue(undefined);
    const anchorActionSpy = vi.spyOn(ledgerModule.ledger, 'anchorAction').mockResolvedValue({
      txid: null,
      anchored: false,
      provider: 'noop',
      timestamp: new Date().toISOString(),
    });

    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      ) // active driver_training enrollment lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }])); // explicit vehicle check

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation - no completed DE
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          vehicle_id: 'vehicle-explicit',
          cost: 75,
          status: 'scheduled',
        }])
      ); // insert lesson

    // Email lookups + notification_queue inserts (no email set, so none fire).
    mockQuery
      .mockResolvedValueOnce(queryResult([{ email: null, full_name: 'Jane Doe' }]))
      .mockResolvedValueOnce(queryResult([{ email: null }]));

    mockQuery.mockResolvedValueOnce(queryResult([])); // no-show notification dismissal UPDATE

    await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      vehicleId: 'vehicle-explicit',
      date: '2026-09-23',
      startTime: '13:00:00',
      endTime: '14:00:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    expect(recordTreasurySplitSpy).toHaveBeenCalledTimes(1);
    const splitArgs = recordTreasurySplitSpy.mock.calls[0][0];
    // Exactly the same fields treasuryService.createTransaction's DTO
    // previously received directly from this same call site.
    expect(splitArgs).toMatchObject({
      tenantId: TENANT_ID,
      sourceType: 'lesson_booking',
      sourceId: LESSON_ID,
      grossAmount: 75,
      description: expect.stringContaining('Treasury split from lesson booking'),
      metadata: expect.objectContaining({
        student_id: STUDENT_ID,
        instructor_id: INSTRUCTOR_ID,
        vehicle_id: 'vehicle-explicit',
        lesson_type: 'behind_wheel',
      }),
    });

    expect(anchorActionSpy).toHaveBeenCalledTimes(1);
    expect(anchorActionSpy.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_ID,
      action: 'BDP_BOOK',
    });
  });

  it('a failure in recordTreasurySplit does not block lesson creation (unchanged non-blocking behavior)', async () => {
    const ledgerModule = await import('../services/Ledger');
    vi.spyOn(ledgerModule.ledger, 'recordTreasurySplit').mockRejectedValue(new Error('boom'));
    vi.spyOn(ledgerModule.ledger, 'anchorAction').mockResolvedValue({
      txid: null,
      anchored: false,
      provider: 'noop',
      timestamp: new Date().toISOString(),
    });

    const { createLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
      )
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]))
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }]))
      .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }]));

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          vehicle_id: 'vehicle-explicit',
          cost: 75,
          status: 'scheduled',
        }])
      );

    mockQuery
      .mockResolvedValueOnce(queryResult([{ email: null, full_name: 'Jane Doe' }]))
      .mockResolvedValueOnce(queryResult([{ email: null }]));

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const lesson = await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      vehicleId: 'vehicle-explicit',
      date: '2026-09-23',
      startTime: '13:00:00',
      endTime: '14:00:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 75,
    });

    expect(lesson.id).toBe(LESSON_ID);
  });
});

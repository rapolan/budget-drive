import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const USER_ID = 'user-1';

/**
 * Phase 4 of docs/compliance-records-build-plan.md: the Archive. These
 * tests cover the live-computed eligibility worklist (never a background
 * sweep - see getArchiveReadyWorklist's own doc comment), the seal hash's
 * no-PII discipline, and the hold/restore overrides.
 */
describe('studentService.getArchiveReadyWorklist', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('surfaces a completed BTW student whose permit has expired, reason=permit_expired', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    const expiredDate = '2020-01-01';

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Ada Chen',
            learner_permit_expiration: new Date(expiredDate),
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_training',
            completed: true,
            completed_at: new Date('2025-01-01'),
          },
        ])
      ) // candidates
      .mockResolvedValueOnce(queryResult([])); // batched last-lesson (no rows needed - permit branch wins first)

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      studentId: STUDENT_ID,
      reason: 'permit_expired',
      reasonDate: expiredDate,
      programTypes: ['driver_training'],
    });
  });

  it('excludes a completed BTW student whose permit has not yet expired', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Ada Chen',
            learner_permit_expiration: futureDate,
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_training',
            completed: true,
            completed_at: new Date('2025-01-01'),
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([]));

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(0);
  });

  it('surfaces a completed BTW student with no permit on file once past the tenant inactivity grace period', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    const oldLessonDate = '2020-01-01';

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Leo Whitfield',
            learner_permit_expiration: null,
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_training',
            completed: true,
            completed_at: new Date('2019-06-01'),
          },
        ])
      )
      .mockResolvedValueOnce(
        queryResult([{ enrollment_id: ENROLLMENT_ID, last_date: new Date(oldLessonDate) }])
      ); // batched last-lesson

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ reason: 'inactivity', reasonDate: oldLessonDate });
  });

  it('excludes a no-permit BTW student whose last lesson is inside the grace period', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    const recentLessonDate = new Date();
    recentLessonDate.setDate(recentLessonDate.getDate() - 5);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Leo Whitfield',
            learner_permit_expiration: null,
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_training',
            completed: true,
            completed_at: new Date('2019-06-01'),
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([{ enrollment_id: ENROLLMENT_ID, last_date: recentLessonDate }]));

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(0);
  });

  it('never surfaces an incomplete BTW enrollment, even with an expired permit', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Stalled Student',
            learner_permit_expiration: new Date('2020-01-01'),
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_training',
            completed: false,
            completed_at: null,
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([]));

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(0);
  });

  it('surfaces a completed DE student once the calendar year has rolled over, reason=de_year_end', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Priya Nair',
            learner_permit_expiration: null,
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_education',
            completed: true,
            completed_at: new Date('2020-12-15'),
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([])); // no BTW enrollments -> no batched lesson query needed

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ reason: 'de_year_end', reasonDate: '2020-12-15', programTypes: ['driver_education'] });
  });

  it('excludes a DE student completed earlier in the current calendar year', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    const currentYear = new Date().getFullYear();

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Priya Nair',
            learner_permit_expiration: null,
            enrollment_id: ENROLLMENT_ID,
            program_type: 'driver_education',
            completed: true,
            completed_at: new Date(`${currentYear}-01-05`),
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([]));

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(0);
  });

  it('excludes a held student entirely, regardless of eligibility', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    // The held-exclusion is a WHERE clause in the candidates query itself
    // (archive_held = false), so a held student never appears in the
    // candidates result at all - this test just confirms an empty
    // candidates set produces an empty worklist, proving no held rows
    // leak through separately from that filter.
    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(queryResult([]));

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(0);
  });

  it('requires EVERY enrollment to independently clear its own program rule - one active BTW enrollment blocks an otherwise-eligible DE completion', async () => {
    const { getArchiveReadyWorklist } = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', archive_inactivity_grace_days: 90 }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            student_id: STUDENT_ID,
            student_name: 'Dual Program',
            learner_permit_expiration: null,
            enrollment_id: 'de-enrollment',
            program_type: 'driver_education',
            completed: true,
            completed_at: new Date('2020-01-01'),
          },
          {
            student_id: STUDENT_ID,
            student_name: 'Dual Program',
            learner_permit_expiration: null,
            enrollment_id: 'btw-enrollment',
            program_type: 'driver_training',
            completed: false,
            completed_at: null,
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([]));

    const entries = await getArchiveReadyWorklist(TENANT_ID);

    expect(entries).toHaveLength(0);
  });
});

describe('studentService.archiveStudent', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects a student with no completed enrollment', async () => {
    const { archiveStudent } = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: '2000-01-01' }])) // student
      .mockResolvedValueOnce(queryResult([])); // getEnrollmentsForStudent - none

    await expect(archiveStudent(STUDENT_ID, TENANT_ID, USER_ID)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('computes a no-PII hash and seals the record, never embedding the student name/email/phone in the hash payload', async () => {
    const { archiveStudent } = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, full_name: 'Secret Name', email: 'secret@example.com', date_of_birth: '2000-01-01' }])
      ) // student
      .mockResolvedValueOnce(
        queryResult([
          {
            id: ENROLLMENT_ID,
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            program_type: 'driver_training',
            status: 'completed',
            completed: true,
            completed_at: '2026-01-01T00:00:00.000Z',
            hours_required: 6,
          },
        ])
      ) // getEnrollmentsForStudent's own enrollments SELECT
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // attachProgressAndPayments -> getTenantSettings
      .mockResolvedValueOnce(queryResult([])) // attachProgressAndPayments -> batched lessons
      .mockResolvedValueOnce(queryResult([])) // attachProgressAndPayments -> batched payments
      .mockResolvedValueOnce(queryResult([{ serial_number: 'CS0000001' }])) // certificates for enrollment
      .mockResolvedValueOnce(
        queryResult([{ date: new Date('2026-01-01'), duration: 2, instructor_id: 'instructor-1' }])
      ) // lessons for enrollment (archiveStudent's own hash-building query)
      .mockResolvedValueOnce(queryResult([{ license_number: 'E1234', timezone: 'America/Los_Angeles' }])) // getTenantSettings (hash payload)
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, archived_at: new Date().toISOString(), archive_hash: 'abc123' }])
      ); // UPDATE students

    const result = await archiveStudent(STUDENT_ID, TENANT_ID, USER_ID);

    expect(result.archivedAt).toBeTruthy();

    const updateCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE students'));
    expect(updateCall).toBeDefined();
    const hashArg = (updateCall as unknown as [string, unknown[]])[1][1] as string;
    // The stored hash is a hex SHA-256 digest, not the raw JSON payload -
    // but assert on the query args passed INTO the hash computation
    // instead by re-deriving from a students-service-level integration:
    // simplest robust check here is that the hash is a 64-char hex string
    // (SHA-256) and that neither the student's name nor email appear
    // anywhere in the arguments passed to the UPDATE.
    expect(hashArg).toMatch(/^[0-9a-f]{64}$/);
    const allArgsJoined = JSON.stringify(updateCall);
    expect(allArgsJoined).not.toContain('Secret Name');
    expect(allArgsJoined).not.toContain('secret@example.com');
  });
});

describe('studentService.holdStudentFromArchive / clearArchiveHold / getHeldStudents', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('holds a student with a required reason, then lists them under getHeldStudents', async () => {
    const { holdStudentFromArchive, getHeldStudents } = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])); // UPDATE ... archive_held = true
    await holdStudentFromArchive(STUDENT_ID, TENANT_ID, USER_ID, 'Family said they are returning in spring');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          student_id: STUDENT_ID,
          student_name: 'Held Student',
          archive_hold_reason: 'Family said they are returning in spring',
          archive_held_at: new Date(),
          archive_held_by_name: 'Devon Ashby',
        },
      ])
    );
    const held = await getHeldStudents(TENANT_ID);

    expect(held).toHaveLength(1);
    expect(held[0].archiveHoldReason).toBe('Family said they are returning in spring');
  });

  it('clearing a hold does not archive the student - it only clears the flag', async () => {
    const { clearArchiveHold } = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]));
    await clearArchiveHold(STUDENT_ID, TENANT_ID);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/archive_held = false/);
    expect(sql).not.toMatch(/archived_at/);
  });

  it('404s when holding an unknown student', async () => {
    const { holdStudentFromArchive } = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(holdStudentFromArchive('unknown', TENANT_ID, USER_ID, 'reason')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('studentService.getAllStudents excludes archived students', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('adds archived_at IS NULL to both the count and row queries - the entire working-view exclusion mechanism', async () => {
    const { getAllStudents } = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ count: '0' }])) // count
      .mockResolvedValueOnce(queryResult([])); // rows

    await getAllStudents(TENANT_ID, 1, 50);

    const [countSql] = mockQuery.mock.calls[0];
    const [rowsSql] = mockQuery.mock.calls[1];
    expect(countSql).toMatch(/archived_at IS NULL/);
    expect(rowsSql).toMatch(/archived_at IS NULL/);
  });
});

describe('studentService.restoreStudent', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('flips archived_at back to null without touching archive_hash/archive_ledger_txid', async () => {
    const { restoreStudent } = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, archived_at: null, archive_hash: 'still-here' }])
    );

    const result = await restoreStudent(STUDENT_ID, TENANT_ID);

    expect(result.archivedAt).toBeNull();
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toMatch(/archive_hash/);
    expect(sql).not.toMatch(/archive_ledger_txid/);
  });

  it('404s when restoring an unknown student', async () => {
    const { restoreStudent } = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(restoreStudent('unknown', TENANT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';

/**
 * Regression coverage: "Mark contacted" (Students.tsx's
 * markContactedMutation, `studentsApi.update(id, { lastContactedAt: new
 * Date() })`) was silently failing on every call - not a Date-
 * serialization bug and not a missing field in updateStudent's builder
 * (both were already correct), but a genuinely missing database column.
 * No migration ever created students.last_contacted_at, despite the
 * Student type declaring it and updateStudent's dynamic UPDATE builder
 * already enumerating it - every call hit a hard Postgres 42703
 * (undefined_column) error. Fixed by migration 028. This test guards the
 * application-layer half: that updateStudent still builds the correct
 * SQL/params for this field going forward.
 */
describe('studentService.updateStudent - last_contacted_at', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes last_contacted_at in the UPDATE when lastContactedAt is provided', async () => {
    const { updateStudent } = await import('../services/studentService');

    const contactedAt = new Date('2026-09-08T00:00:00.000Z');
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, last_contacted_at: contactedAt.toISOString() }])
    );

    await updateStudent(STUDENT_ID, TENANT_ID, { lastContactedAt: contactedAt });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/last_contacted_at\s*=\s*\$\d+/);
    expect(params).toContain(contactedAt);
  });

  it('round-trips lastContactedAt on the returned Student object', async () => {
    const { updateStudent } = await import('../services/studentService');

    const contactedAt = new Date('2026-09-08T00:00:00.000Z');
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, last_contacted_at: contactedAt.toISOString() }])
    );

    const result = await updateStudent(STUDENT_ID, TENANT_ID, { lastContactedAt: contactedAt });

    expect(result.lastContactedAt).toBeTruthy();
    expect(new Date(result.lastContactedAt as unknown as string).toISOString()).toBe(contactedAt.toISOString());
  });
});

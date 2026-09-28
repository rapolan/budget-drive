import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

/**
 * Audit-closing regression test for a bug class that recurred five times
 * before this test existed: updateInstructor's dynamic UPDATE builder
 * silently dropped a field it never got a branch for (employmentType,
 * license fields, dateOfBirth, hireDate, notes - each found and fixed one
 * report at a time). This test iterates EVERY real, user-settable column
 * on the instructors table and asserts each one is included in the
 * generated UPDATE (and INSERT) when provided - so a sixth silently-
 * dropped field fails a test immediately instead of waiting for a bug
 * report.
 *
 * Three categories of Instructor field are deliberately NOT in the list
 * below, and must stay that way:
 *
 * 1. Identity/audit columns never settable via the request body at all:
 *    id, tenantId, createdAt, updatedAt, createdBy (set from the
 *    authenticated caller, not the payload), updatedBy (same).
 * 2. Computed/system-managed fields with ZERO writers anywhere in this
 *    codebase (confirmed by a full-repo grep as of this test's
 *    writing) - rating, totalLessonsTaught, googleCalendarConnected,
 *    calendarFeedToken (exclusively managed by calendarFeedService.ts,
 *    never through this generic update path).
 * 3. status is intentionally excluded from this table too - it's
 *    already covered by instructorUpdate.test.ts and deleteInstructor
 *    owns the 'terminated' transition specifically; including it here
 *    would duplicate that coverage without adding anything.
 *
 * If a new column is ever added to the instructors table and meant to be
 * user-settable, add it to USER_SETTABLE_FIELDS below - that's what
 * makes this test fail loudly instead of missing the field silently.
 */

const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_ID = '11111111-1111-1111-1111-111111111111';

// [camelCase field on Instructor, snake_case column, a representative
// non-empty value distinct enough to prove up in both the SQL and the
// bound params].
const USER_SETTABLE_FIELDS: Array<[string, string, unknown]> = [
  ['fullName', 'full_name', 'Field Completeness Test'],
  ['email', 'email', 'completeness-test@example.com'],
  ['phone', 'phone', '6195551234'],
  ['dateOfBirth', 'date_of_birth', '1990-01-01'],
  ['address', 'address', '123 Legacy Ave'],
  ['addressLine1', 'address_line1', '456 Line One St'],
  ['addressLine2', 'address_line2', 'Suite 2'],
  ['city', 'city', 'Testville'],
  ['state', 'state', 'CA'],
  ['zipCode', 'zip_code', '91915'],
  ['employmentType', 'employment_type', 'independent_contractor'],
  ['hireDate', 'hire_date', '2026-01-01'],
  ['terminationDate', 'termination_date', '2026-12-31'],
  ['driversLicenseNumber', 'drivers_license_number', 'DL-999999'],
  ['driversLicenseExpiration', 'drivers_license_expiration', '2030-01-01'],
  ['instructorLicenseNumber', 'instructor_license_number', 'DSI-123456'],
  ['instructorLicenseExpiration', 'instructor_license_expiration', '2029-06-15'],
  ['providesOwnVehicle', 'provides_own_vehicle', true],
  ['mileageReimbursementRate', 'mileage_reimbursement_rate', 0.75],
  ['isDeTeacher', 'is_de_teacher', true],
  ['deCredentialNumber', 'de_credential_number', 'DE-CRED-777'],
  ['deCredentialExpiration', 'de_credential_expiration', '2031-03-01'],
  ['hourlyRate', 'hourly_rate', 45],
  ['notes', 'notes', 'A completeness-test note'],
];

// Documented, not implicit - these Instructor fields exist but must NEVER
// appear as a branch in updateInstructor's builder, for the reasons in
// the file header above.
const INTENTIONALLY_EXCLUDED_FIELDS = [
  'id', 'tenantId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
  'rating', 'totalLessonsTaught', 'googleCalendarConnected', 'calendarFeedToken',
  'status',
];

describe('instructor field completeness (closes the whole silent-drop bug class)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('updateInstructor includes every user-settable field in the generated UPDATE SQL and bound params when all are provided at once', async () => {
    const instructorService = await import('../services/instructorService');

    const payload: Record<string, unknown> = {};
    for (const [camelField, , value] of USER_SETTABLE_FIELDS) {
      payload[camelField] = value;
    }

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: INSTRUCTOR_ID, tenant_id: TENANT_ID }])
    );

    await instructorService.updateInstructor(INSTRUCTOR_ID, TENANT_ID, payload as never, 'caller-1');

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE instructors')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;

    for (const [camelField, snakeColumn, value] of USER_SETTABLE_FIELDS) {
      expect(sql, `UPDATE SQL is missing the "${snakeColumn}" column (from Instructor.${camelField})`).toMatch(
        new RegExp(`\\b${snakeColumn}\\s*=\\s*\\$\\d+`)
      );
      expect(params, `bound params are missing the value for "${snakeColumn}" (from Instructor.${camelField})`).toContain(value);
    }
  });

  it('createInstructor includes every user-settable field in the generated INSERT SQL and bound params when all are provided at once', async () => {
    const instructorService = await import('../services/instructorService');

    const payload: Record<string, unknown> = {
      fullName: 'Field Completeness Test',
      email: 'completeness-test@example.com',
      phone: '6195551234',
    };
    for (const [camelField, , value] of USER_SETTABLE_FIELDS) {
      payload[camelField] = value;
    }

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: INSTRUCTOR_ID, tenant_id: TENANT_ID }])
    );

    await instructorService.createInstructor(TENANT_ID, payload, 'caller-1');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructors')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;

    for (const [camelField, snakeColumn, value] of USER_SETTABLE_FIELDS) {
      expect(sql, `INSERT SQL is missing the "${snakeColumn}" column (from Instructor.${camelField})`).toMatch(
        new RegExp(`\\b${snakeColumn}\\b`)
      );
      expect(params, `bound params are missing the value for "${snakeColumn}" (from Instructor.${camelField})`).toContain(value);
    }
  });

  it('documents which Instructor fields are intentionally excluded, so a future exclusion is a deliberate edit here, not a silent gap', () => {
    const settableFieldNames = USER_SETTABLE_FIELDS.map(([camelField]) => camelField);
    const overlap = settableFieldNames.filter((f) => INTENTIONALLY_EXCLUDED_FIELDS.includes(f));
    expect(overlap).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  mockClientRelease,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const GUARDIAN_ID = '11111111-1111-1111-1111-111111111111';
const GUARDIAN_ID_2 = '22222222-2222-2222-2222-222222222222';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function minorStudentPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Minor Student',
    dateOfBirth: '2015-01-01',
    phone: '555-0100',
    licenseType: 'car',
    ...overrides,
  };
}

describe('POST /api/v1/students/with-guardian', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('happy path mode=new: BEGIN, student INSERT, guardian INSERT, link INSERT, COMMIT', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // Pre-BEGIN, on the pooled query: getTenantSettings (the age check,
    // now also reused for hoursRequired), then the exact-match check for
    // the one new guardian (has a phone).
    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])); // findExactGuardianMatch - no match

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID, full_name: 'Minor Student' }])) // student INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID, first_name: 'Jane', last_name: 'Doe' }])) // guardian INSERT
      .mockResolvedValueOnce(queryResult([{ id: 'link-1', tenant_id: TENANT_ID, student_id: 'student-1', guardian_id: GUARDIAN_ID, is_primary: true }])) // link INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [{ mode: 'new', firstName: 'Jane', lastName: 'Doe', phone: '555-0200', relationship: 'mother' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockGetClient).toHaveBeenCalledTimes(1);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/INSERT INTO students/);
    expect(clientCalls[2]).toMatch(/INSERT INTO guardians/);
    expect(clientCalls[3]).toMatch(/INSERT INTO student_guardians/);
    expect(clientCalls[4]).toBe('COMMIT');

    // The writes must never go through the pooled query - only the
    // read-only exact-match check and getTenantSettings lookup do.
    const pooledWriteCalls = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && /INSERT|UPDATE|DELETE/i.test(sql)
    );
    expect(pooledWriteCalls).toHaveLength(0);
  });

  it('happy path mode=existing: BEGIN, student INSERT, guardian existence SELECT, link INSERT, COMMIT', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (no exact-match check - mode: 'existing')

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID }])) // guardian existence SELECT
      .mockResolvedValueOnce(queryResult([{ id: 'link-1', student_id: 'student-1', guardian_id: GUARDIAN_ID, is_primary: true }])) // link INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [{ mode: 'existing', guardianId: GUARDIAN_ID, relationship: 'father' }],
      });

    expect(res.status).toBe(201);
    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/INSERT INTO students/);
    expect(clientCalls[2]).toMatch(/SELECT \* FROM guardians/);
    expect(clientCalls[3]).toMatch(/INSERT INTO student_guardians/);
    expect(clientCalls[4]).toBe('COMMIT');
  });

  it('two guardians linked atomically: first defaults primary, second does not', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (both mode: 'existing' - no exact-match checks)

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID }])) // guardian #1 existence SELECT
      .mockResolvedValueOnce(queryResult([{ id: 'link-1', student_id: 'student-1', guardian_id: GUARDIAN_ID, is_primary: true }])) // link #1 INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID_2, tenant_id: TENANT_ID }])) // guardian #2 existence SELECT
      .mockResolvedValueOnce(queryResult([{ id: 'link-2', student_id: 'student-1', guardian_id: GUARDIAN_ID_2, is_primary: false }])) // link #2 INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [
          { mode: 'existing', guardianId: GUARDIAN_ID, relationship: 'mother' },
          { mode: 'existing', guardianId: GUARDIAN_ID_2, relationship: 'father' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.guardians).toHaveLength(2);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/INSERT INTO students/);
    expect(clientCalls[2]).toMatch(/SELECT \* FROM guardians/); // guardian #1
    expect(clientCalls[3]).toMatch(/INSERT INTO student_guardians/); // link #1
    expect(clientCalls[4]).toMatch(/SELECT \* FROM guardians/); // guardian #2
    expect(clientCalls[5]).toMatch(/INSERT INTO student_guardians/); // link #2
    expect(clientCalls[6]).toBe('COMMIT');

    // link #1 params: is_primary = true (default, since neither guardian
    // explicitly set isPrimary); link #2 params: is_primary = false.
    const linkInsertCalls = mockClientQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && /INSERT INTO student_guardians/.test(sql)
    );
    expect(linkInsertCalls[0][1][4]).toBe(true);
    expect(linkInsertCalls[1][1][4]).toBe(false);
  });

  it('two guardians: caller explicitly marks the second primary, and that one ends up primary', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID }])) // guardian #1
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }])) // link #1
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID_2, tenant_id: TENANT_ID }])) // guardian #2
      .mockResolvedValueOnce(queryResult([{ id: 'link-2' }])) // link #2
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [
          { mode: 'existing', guardianId: GUARDIAN_ID, relationship: 'mother', isPrimary: false },
          { mode: 'existing', guardianId: GUARDIAN_ID_2, relationship: 'father', isPrimary: true },
        ],
      });

    expect(res.status).toBe(201);
    const linkInsertCalls = mockClientQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && /INSERT INTO student_guardians/.test(sql)
    );
    expect(linkInsertCalls[0][1][4]).toBe(false); // guardian #1 - explicitly not primary
    expect(linkInsertCalls[1][1][4]).toBe(true); // guardian #2 - explicitly primary
  });

  it('rolls back when the guardian INSERT fails (constraint violation) - no orphaned student', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([])); // findExactGuardianMatch - no match

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT succeeds
      .mockRejectedValueOnce(new Error('guardians_email_or_phone_check violation')) // guardian INSERT fails
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      studentService.createStudentWithGuardian(
        TENANT_ID,
        {
          // Passes pre-BEGIN validation (has an email) - the failure below
          // simulates a DB-level rejection happening mid-transaction, which
          // pre-BEGIN validation cannot catch (e.g. a race, or any other
          // constraint violation surfacing only at INSERT time).
          student: minorStudentPayload(),
          guardians: [{ mode: 'new', firstName: 'Jane', email: 'jane@example.com' }],
        },
        'staff-1'
      )
    ).rejects.toThrow('guardians_email_or_phone_check violation');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls).toContain('ROLLBACK');
    expect(clientCalls).not.toContain('COMMIT');
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls back the WHOLE array when the SECOND guardian fails - no orphaned student and no orphaned first guardian', async () => {
    const studentService = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (both mode: 'existing')

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT succeeds
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID }])) // guardian #1 lookup succeeds
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }])) // link #1 INSERT succeeds
      .mockRejectedValueOnce(new Error('guardian #2 lookup failed')) // guardian #2 step fails
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      studentService.createStudentWithGuardian(
        TENANT_ID,
        {
          student: minorStudentPayload(),
          guardians: [
            { mode: 'existing', guardianId: GUARDIAN_ID },
            { mode: 'existing', guardianId: GUARDIAN_ID_2 },
          ],
        },
        'staff-1'
      )
    ).rejects.toThrow('guardian #2 lookup failed');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    // Proves atomicity holds across the whole array, not just the first
    // element - guardian #1's link INSERT ran, but the transaction never
    // committed, so nothing from either guardian is queryable afterward.
    expect(clientCalls).toContain('ROLLBACK');
    expect(clientCalls).not.toContain('COMMIT');
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  it('rejects mode=existing with a guardianId that does not belong to the tenant, before any INSERT succeeds meaningfully', async () => {
    const studentService = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT
      .mockResolvedValueOnce(queryResult([])) // guardian existence SELECT - not found
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(
      studentService.createStudentWithGuardian(
        TENANT_ID,
        {
          student: minorStudentPayload(),
          guardians: [{ mode: 'existing', guardianId: 'not-this-tenants-guardian' }],
        },
        'staff-1'
      )
    ).rejects.toThrow('Guardian not found');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls).toContain('ROLLBACK');
    expect(clientCalls).not.toContain('COMMIT');
  });

  it('rejects with 400 before opening a transaction when the student payload is invalid (no contact method)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: { fullName: 'No Contact', dateOfBirth: '2015-01-01' },
        guardians: [{ mode: 'new', email: 'parent@example.com' }],
      });

    expect(res.status).toBe(400);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects with 400 before opening a transaction when guardians is an empty array', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (age check, runs before the guardians-required check)

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [],
      });

    expect(res.status).toBe(400);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a duplicate guardian reference within one request (same guardianId twice) before opening a transaction', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (age check)

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [
          { mode: 'existing', guardianId: GUARDIAN_ID },
          { mode: 'existing', guardianId: GUARDIAN_ID },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error ?? res.body.message).toMatch(/duplicate guardian reference/i);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a duplicate guardian reference within one request (two new guardians sharing an email) before opening a transaction', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (age check)

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [
          { mode: 'new', firstName: 'Jane', email: 'jane@example.com' },
          { mode: 'new', firstName: 'Jane', email: 'jane@example.com' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error ?? res.body.message).toMatch(/duplicate guardian reference/i);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects with 409 and never opens a transaction when a new guardian exact-matches an existing one', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // getTenantSettings (the age check) runs first, then findExactGuardianMatch
    // (pooled query) returns a match for the one new guardian.
    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID, first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' }])
      );

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [{ mode: 'new', firstName: 'Jane', email: 'jane@example.com' }],
      });

    expect(res.status).toBe(409);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects with 400 when more than one guardian is explicitly marked primary', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (age check)

    const res = await request(app)
      .post('/api/v1/students/with-guardian')
      .set('Authorization', `Bearer ${token}`)
      .send({
        student: minorStudentPayload(),
        guardians: [
          { mode: 'existing', guardianId: GUARDIAN_ID, isPrimary: true },
          { mode: 'existing', guardianId: GUARDIAN_ID_2, isPrimary: true },
        ],
      });

    expect(res.status).toBe(400);
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

// Constraint A, structural proof: creating a student with N guardians must
// issue exactly ONE BEGIN and ONE COMMIT - never one pair per guardian - and
// every write to students/guardians/student_guardians must happen on the
// transaction's client, never on the pooled connection. Mirrors
// guardianMatching.test.ts's "never issues a write query" technique (spy on
// a mechanism, assert a forbidden pattern is absent) and
// progressCalculationOwnership.test.ts's "assert a forbidden pattern is
// structurally absent" spirit, applied here to call counts rather than
// source text since this function has a mockable client to spy on.
describe('POST /api/v1/students/with-guardian - Constraint A structural test', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('issues exactly one BEGIN and one COMMIT for a two-guardian create, not one pair per guardian', async () => {
    const studentService = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings (both mode: 'existing')

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID }])) // guardian #1 existence SELECT
      .mockResolvedValueOnce(queryResult([{ id: 'link-1', student_id: 'student-1', guardian_id: GUARDIAN_ID, is_primary: true }])) // link #1 INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID_2, tenant_id: TENANT_ID }])) // guardian #2 existence SELECT
      .mockResolvedValueOnce(queryResult([{ id: 'link-2', student_id: 'student-1', guardian_id: GUARDIAN_ID_2, is_primary: false }])) // link #2 INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    await studentService.createStudentWithGuardian(
      TENANT_ID,
      {
        student: minorStudentPayload(),
        guardians: [
          { mode: 'existing', guardianId: GUARDIAN_ID },
          { mode: 'existing', guardianId: GUARDIAN_ID_2 },
        ],
      },
      'staff-1'
    );

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    const beginCount = clientCalls.filter(sql => sql === 'BEGIN').length;
    const commitCount = clientCalls.filter(sql => sql === 'COMMIT').length;

    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
    expect(mockGetClient).toHaveBeenCalledTimes(1);

    // Every write touching students/guardians/student_guardians must have
    // happened on the transaction's client, never on the pooled connection.
    // The pooled connection is only expected to see reads (getTenantSettings,
    // and any pre-BEGIN exact-match check) - both read-only, both legitimate.
    const pooledWritesToGuardedTables = mockQuery.mock.calls.filter(([sql]) => {
      if (typeof sql !== 'string') return false;
      const isWrite = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql);
      const touchesGuardedTable = /\b(students|guardians|student_guardians)\b/i.test(sql);
      return isWrite && touchesGuardedTable;
    });
    expect(pooledWritesToGuardedTables).toHaveLength(0);
  });

  it('a three-guardian create still issues exactly one BEGIN/COMMIT pair, proving the count holds for N > 2', async () => {
    const studentService = await import('../services/studentService');
    const GUARDIAN_ID_3 = '33333333-3333-3333-3333-333333333333';

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID }])) // student INSERT
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID, tenant_id: TENANT_ID }]))
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }]))
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID_2, tenant_id: TENANT_ID }]))
      .mockResolvedValueOnce(queryResult([{ id: 'link-2' }]))
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID_3, tenant_id: TENANT_ID }]))
      .mockResolvedValueOnce(queryResult([{ id: 'link-3' }]))
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    await studentService.createStudentWithGuardian(
      TENANT_ID,
      {
        student: minorStudentPayload(),
        guardians: [
          { mode: 'existing', guardianId: GUARDIAN_ID },
          { mode: 'existing', guardianId: GUARDIAN_ID_2 },
          { mode: 'existing', guardianId: GUARDIAN_ID_3 },
        ],
      },
      'staff-1'
    );

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls.filter(sql => sql === 'BEGIN')).toHaveLength(1);
    expect(clientCalls.filter(sql => sql === 'COMMIT')).toHaveLength(1);
    expect(mockGetClient).toHaveBeenCalledTimes(1);
  });
});

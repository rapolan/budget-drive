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

    // getTenantSettings runs on the pooled query (hoursRequired undefined)
    mockQuery.mockResolvedValueOnce(queryResult([]));

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
        guardian: { mode: 'new', firstName: 'Jane', lastName: 'Doe', phone: '555-0200', relationship: 'mother' },
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
    // read-only getTenantSettings lookup does.
    const pooledWriteCalls = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && /INSERT|UPDATE|DELETE/i.test(sql)
    );
    expect(pooledWriteCalls).toHaveLength(0);
  });

  it('happy path mode=existing: BEGIN, student INSERT, guardian existence SELECT, link INSERT, COMMIT', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings

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
        guardian: { mode: 'existing', guardianId: GUARDIAN_ID, relationship: 'father' },
      });

    expect(res.status).toBe(201);
    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/INSERT INTO students/);
    expect(clientCalls[2]).toMatch(/SELECT \* FROM guardians/);
    expect(clientCalls[3]).toMatch(/INSERT INTO student_guardians/);
    expect(clientCalls[4]).toBe('COMMIT');
  });

  it('rolls back when the guardian INSERT fails (constraint violation) - no orphaned student', async () => {
    const studentService = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // getTenantSettings

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
          guardian: { mode: 'new', firstName: 'Jane', email: 'jane@example.com' },
        },
        'staff-1'
      )
    ).rejects.toThrow('guardians_email_or_phone_check violation');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
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
          guardian: { mode: 'existing', guardianId: 'not-this-tenants-guardian' },
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
        guardian: { mode: 'new', email: 'parent@example.com' },
      });

    expect(res.status).toBe(400);
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

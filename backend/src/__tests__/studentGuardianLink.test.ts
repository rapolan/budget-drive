import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const GUARDIAN_ID = '11111111-1111-1111-1111-111111111111';
const GUARDIAN_ID_2 = '33333333-3333-3333-3333-333333333333';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('student-guardian linking', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('links a guardian to a student with relationship and isPrimary=false', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // 1. student existence check 2. guardian existence check 3. the INSERT
    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'link-1',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          guardian_id: GUARDIAN_ID,
          relationship: 'mother',
          is_primary: false,
        }])
      );

    const res = await request(app)
      .post(`/api/v1/students/${STUDENT_ID}/guardians`)
      .set('Authorization', `Bearer ${token}`)
      .send({ guardianId: GUARDIAN_ID, relationship: 'mother' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('setting isPrimary=true on link creation demotes the previously-primary guardian in one transaction', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID_2 }])) // guardian check
      .mockResolvedValueOnce(
        queryResult([{
          id: 'link-2',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          guardian_id: GUARDIAN_ID_2,
          relationship: 'father',
          is_primary: false,
        }])
      ) // INSERT
      .mockResolvedValueOnce(
        queryResult([{
          id: 'link-2',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          guardian_id: GUARDIAN_ID_2,
          relationship: 'father',
          is_primary: true,
        }])
      ); // refresh read after promotion

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // demote previous primary
      .mockResolvedValueOnce(queryResult([{ id: 'link-2' }])) // promote new primary
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const res = await request(app)
      .post(`/api/v1/students/${STUDENT_ID}/guardians`)
      .set('Authorization', `Bearer ${token}`)
      .send({ guardianId: GUARDIAN_ID_2, relationship: 'father', isPrimary: true });

    expect(res.status).toBe(201);
    expect(mockGetClient).toHaveBeenCalledTimes(1);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/is_primary = false/);
    expect(clientCalls[2]).toMatch(/is_primary = true/);
    expect(clientCalls[3]).toBe('COMMIT');
  });

  it('rejects linking when guardianId is missing from the body', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post(`/api/v1/students/${STUDENT_ID}/guardians`)
      .set('Authorization', `Bearer ${token}`)
      .send({ relationship: 'mother' });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates the relationship on an existing student-guardian link (a property of the link, not the guardian)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'link-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        guardian_id: GUARDIAN_ID,
        relationship: 'father',
        is_primary: false,
      }])
    );

    const res = await request(app)
      .put(`/api/v1/students/${STUDENT_ID}/guardians/${GUARDIAN_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ relationship: 'father' });

    expect(res.status).toBe(200);
    expect(res.body.data.relationship).toBe('father');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE student_guardians/);
    expect(sql).toMatch(/SET relationship/);
    expect(params).toEqual(['father', STUDENT_ID, GUARDIAN_ID, TENANT_ID]);
  });

  it('returns 404 when updating relationship on a link that does not exist', async () => {
    const studentGuardianService = await import('../services/studentGuardianService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(
      studentGuardianService.updateGuardianRelationship(STUDENT_ID, GUARDIAN_ID, TENANT_ID, 'mother')
    ).rejects.toThrow('Guardian link not found for this student');
  });

  it('blocks deleting a guardian who still has linked students, naming the student', async () => {
    const guardianService = await import('../services/guardianService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, full_name: 'Jessica Park' }])
    );

    await expect(
      guardianService.deleteGuardian(GUARDIAN_ID, TENANT_ID)
    ).rejects.toThrow(/Jessica Park/);
  });

  it('allows deleting a guardian with no linked students', async () => {
    const guardianService = await import('../services/guardianService');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // linked-students check: none
      .mockResolvedValueOnce(queryResult([{ id: GUARDIAN_ID }])); // DELETE

    await expect(
      guardianService.deleteGuardian(GUARDIAN_ID, TENANT_ID)
    ).resolves.toBeUndefined();
  });

  it('unlinking a guardian from an adult student succeeds and does not delete the guardian', async () => {
    const studentGuardianService = await import('../services/studentGuardianService');

    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ date_of_birth: adultDob.toISOString() }])) // student DOB lookup - adult, no guardian-count check
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }])); // DELETE

    await expect(
      studentGuardianService.unlinkGuardianFromStudent(STUDENT_ID, GUARDIAN_ID, TENANT_ID)
    ).resolves.toBeUndefined();

    const deleteCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('DELETE'));
    expect(deleteCall![0]).toMatch(/DELETE FROM student_guardians/);
    expect(deleteCall![0]).not.toMatch(/DELETE FROM guardians/);
  });

  it('unlinking a minor\'s second guardian succeeds (only the LAST guardian is protected)', async () => {
    const studentGuardianService = await import('../services/studentGuardianService');

    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ date_of_birth: minorDob.toISOString() }])) // student DOB - minor
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ count: '2' }])) // guardian count - 2 linked
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }])); // DELETE

    await expect(
      studentGuardianService.unlinkGuardianFromStudent(STUDENT_ID, GUARDIAN_ID, TENANT_ID)
    ).resolves.toBeUndefined();
  });

  it('rejects unlinking a minor\'s only guardian, and never issues the DELETE', async () => {
    const studentGuardianService = await import('../services/studentGuardianService');

    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ date_of_birth: minorDob.toISOString() }])) // student DOB - minor
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ count: '1' }])); // guardian count - only 1 linked

    await expect(
      studentGuardianService.unlinkGuardianFromStudent(STUDENT_ID, GUARDIAN_ID, TENANT_ID)
    ).rejects.toThrow(/only guardian while they are a minor/i);

    const deleteCall = mockQuery.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('DELETE'));
    expect(deleteCall).toBeUndefined();
  });

  it('treats a student with an unknown date of birth as a minor for the last-guardian guard', async () => {
    const studentGuardianService = await import('../services/studentGuardianService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ date_of_birth: null }])) // unknown DOB
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ count: '1' }])); // only 1 linked guardian

    await expect(
      studentGuardianService.unlinkGuardianFromStudent(STUDENT_ID, GUARDIAN_ID, TENANT_ID)
    ).rejects.toThrow(/only guardian while they are a minor/i);
  });
});

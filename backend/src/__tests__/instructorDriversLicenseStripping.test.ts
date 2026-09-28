import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_A = '11111111-1111-1111-1111-111111111111';
const INSTRUCTOR_B = '22222222-2222-2222-2222-222222222222';

function signToken(userId: string, role?: string, instructorId?: string) {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role, instructorId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// driversLicenseNumber/driversLicenseExpiration is the instructor's own
// personal driver's license - a distinct credential from the Driving
// School Instructor License (docs/BLUEPRINTS.md), never wired into the
// UI yet but already returned unconditionally by GET /instructors and
// GET /instructors/:id (both plain SELECT * reads). This is real PII
// that must never be visible to a DIFFERENT instructor's session, even
// though nothing writes it today (found while auditing
// createInstructor/updateInstructor for field completeness).
describe('driversLicenseNumber/driversLicenseExpiration stripping for instructor-role callers', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('GET /instructors strips driversLicenseNumber/driversLicenseExpiration for an instructor-role caller', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: INSTRUCTOR_A,
          tenant_id: TENANT_ID,
          full_name: 'Self',
          drivers_license_number: 'DL-SELF-1',
          drivers_license_expiration: '2030-01-01',
        },
        {
          id: INSTRUCTOR_B,
          tenant_id: TENANT_ID,
          full_name: 'Colleague',
          drivers_license_number: 'DL-OTHER-2',
          drivers_license_expiration: '2031-01-01',
        },
      ])
    );

    const res = await request(app)
      .get('/api/v1/instructors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('driversLicenseNumber');
      expect(row).not.toHaveProperty('driversLicenseExpiration');
    }
  });

  it('GET /instructors keeps driversLicenseNumber/driversLicenseExpiration for an admin caller', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: INSTRUCTOR_A,
          tenant_id: TENANT_ID,
          full_name: 'Someone',
          drivers_license_number: 'DL-1',
          drivers_license_expiration: '2030-01-01',
        },
      ])
    );

    const res = await request(app)
      .get('/api/v1/instructors')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('driversLicenseNumber', 'DL-1');
  });

  it('GET /instructors/:id strips driversLicenseNumber/driversLicenseExpiration when an instructor views a DIFFERENT instructor', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: INSTRUCTOR_B,
          tenant_id: TENANT_ID,
          full_name: 'Colleague',
          drivers_license_number: 'DL-OTHER-2',
          drivers_license_expiration: '2031-01-01',
        },
      ])
    );

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_B}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('driversLicenseNumber');
    expect(res.body.data).not.toHaveProperty('driversLicenseExpiration');
  });

  it('GET /instructors/:id keeps driversLicenseNumber/driversLicenseExpiration when an instructor views their OWN record by id', async () => {
    const { default: app } = await import('../app');
    const token = signToken('user-1', 'instructor', INSTRUCTOR_A);

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: INSTRUCTOR_A,
          tenant_id: TENANT_ID,
          full_name: 'Self',
          drivers_license_number: 'DL-SELF-1',
          drivers_license_expiration: '2030-01-01',
        },
      ])
    );

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_A}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('driversLicenseNumber', 'DL-SELF-1');
  });

  it('GET /instructors/:id keeps driversLicenseNumber/driversLicenseExpiration for an admin viewing any instructor', async () => {
    const { default: app } = await import('../app');
    const token = signToken('admin-1', 'admin');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: INSTRUCTOR_B,
          tenant_id: TENANT_ID,
          full_name: 'Colleague',
          drivers_license_number: 'DL-OTHER-2',
          drivers_license_expiration: '2031-01-01',
        },
      ])
    );

    const res = await request(app)
      .get(`/api/v1/instructors/${INSTRUCTOR_B}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('driversLicenseNumber', 'DL-OTHER-2');
  });
});

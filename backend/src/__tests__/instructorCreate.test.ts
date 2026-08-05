import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression test for a 500 on instructor creation: the INSERT referenced
// created_by/updated_by columns that don't exist on the instructors table
// (unlike students, instructors has no user-attribution columns).
const formPayload = {
  fullName: 'Playwright Test Instructor',
  email: 'pw.test.instructor@example.com',
  phone: '555-0123',
  dateOfBirth: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
  homeZipCode: '',
  serviceZipCodes: '',
  licenseNumber: '',
  licenseExpiration: '',
  employmentType: 'w2_employee',
  hireDate: '2026-08-04',
  hourlyRate: 0,
  notes: '',
};

describe('POST /api/v1/instructors', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates an instructor with the form\'s exact payload shape', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'instructor-1',
        tenant_id: TENANT_ID,
        full_name: formPayload.fullName,
        email: formPayload.email,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/instructors')
      .set('Authorization', `Bearer ${token}`)
      .send(formPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructors')
    );
    expect(insertCall).toBeDefined();
    const [sql] = insertCall!;
    // created_by/updated_by don't exist on the instructors table - must
    // never be referenced in the INSERT column list again.
    expect(sql).not.toMatch(/created_by|updated_by/);
  });
});

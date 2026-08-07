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

const MINOR_DOB = '2015-01-01'; // well under 18 relative to any plausible test-run date
const ADULT_DOB = '1990-01-01'; // well over 18

function minorPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Minor Sibling',
    dateOfBirth: MINOR_DOB,
    phone: '555-0100',
    licenseType: 'car',
    ...overrides,
  };
}

function adultPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Adult Student',
    dateOfBirth: ADULT_DOB,
    phone: '555-0200',
    email: 'adult@example.com',
    licenseType: 'car',
    ...overrides,
  };
}

describe('student email optional for minors, required for adults', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates a minor student with no email', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    // No duplicate-email check runs since email is absent - just the
    // hoursRequired tenant-settings lookup, then the INSERT.
    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings - no row, falls back to default
      .mockResolvedValueOnce(
        queryResult([{ id: 'student-1', tenant_id: TENANT_ID, full_name: 'Minor Sibling', email: null }])
      );

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(minorPayload());

    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    expect(insertCall).toBeDefined();
  });

  it('creates a second minor sibling with no email under the same tenant', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'student-1', tenant_id: TENANT_ID, email: null }])) // INSERT
      .mockResolvedValueOnce(queryResult([])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ id: 'student-2', tenant_id: TENANT_ID, email: null }])); // INSERT

    const res1 = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(minorPayload({ fullName: 'Sibling One' }));
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(minorPayload({ fullName: 'Sibling Two' }));
    expect(res2.status).toBe(201);
  });

  it('rejects creating an adult student with no email', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(adultPayload({ email: undefined }));

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('two adult students cannot share an email within a tenant', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'existing-student' }])); // duplicate-email check finds a match

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(adultPayload({ email: 'shared@example.com' }));

    expect(res.status).toBe(400);
  });

  it('two students of any age sharing a non-null email are rejected (the partial index does not special-case age)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'existing-minor' }])); // duplicate-email check finds a match

    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send(minorPayload({ email: 'shared@example.com' }));

    expect(res.status).toBe(400);
  });

  it('updating an adult student email to empty is rejected', async () => {
    const studentService = await import('../services/studentService');

    // getStudentById's fetch-before-write pre-check: 1. the student row
    // 2. attachProgress's batched lessons lookup
    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: 'student-3', tenant_id: TENANT_ID, date_of_birth: ADULT_DOB, email: 'adult@example.com' }])
      )
      .mockResolvedValueOnce(queryResult([]));

    await expect(
      studentService.updateStudent('student-3', TENANT_ID, { email: '' })
    ).rejects.toThrow('Email is required for adult students');
  });
});

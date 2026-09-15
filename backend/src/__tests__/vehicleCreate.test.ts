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

// Regression coverage for two real, live-confirmed production bugs behind
// "the Create Vehicle button does nothing":
// 1. createVehicle's INSERT named created_by/updated_by columns that have
//    never existed on the vehicles table - every creation attempt 500'd
//    regardless of what fields were filled in.
// 2. The form (and the old backend validateRequired list) required make,
//    model, year, licensePlate, and vin - blocking the school's real
//    entry pattern of "I know who owns this vehicle, I'll fill in the
//    rest later." Only ownership should be required now.
describe('POST /api/v1/vehicles', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('creates a vehicle with ONLY ownershipType - no created_by/updated_by in the INSERT', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: '11111111-1111-1111-1111-111111111111',
        tenant_id: TENANT_ID,
        ownership_type: 'school_owned',
        owner_instructor_id: null,
        make: null,
        model: null,
        year: null,
        license_plate: null,
        current_mileage: 0,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ ownershipType: 'school_owned' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO vehicles')
    );
    expect(insertCall).toBeDefined();
    const [sql] = insertCall!;
    // The exact bug: these columns don't exist on vehicles.
    expect(sql).not.toMatch(/created_by/);
    expect(sql).not.toMatch(/updated_by/);
  });

  it('rejects with 400 (not a 500) when ownershipType is missing entirely', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ make: 'Toyota' });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects instructor_owned with no ownerInstructorId', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ ownershipType: 'instructor_owned' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ownerInstructorId/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('creates an instructor_owned vehicle and persists ownerInstructorId', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'vehicle-2',
        tenant_id: TENANT_ID,
        ownership_type: 'instructor_owned',
        owner_instructor_id: 'instructor-1',
        make: null,
        model: null,
        year: null,
        license_plate: null,
        current_mileage: 0,
        status: 'active',
      }])
    );

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ ownershipType: 'instructor_owned', ownerInstructorId: 'instructor-1' });

    expect(res.status).toBe(201);
    expect(res.body.data.ownerInstructorId).toBe('instructor-1');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO vehicles')
    );
    const [, params] = insertCall!;
    expect(params).toContain('instructor-1');
  });
});

describe('PUT /api/v1/vehicles/:id', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('updates a vehicle without referencing updated_by (which does not exist on vehicles)', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: '11111111-1111-1111-1111-111111111111', tenant_id: TENANT_ID, make: 'Honda' }])
    );

    const res = await request(app)
      .put('/api/v1/vehicles/11111111-1111-1111-1111-111111111111')
      .set('Authorization', `Bearer ${token}`)
      .send({ make: 'Honda' });

    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE vehicles')
    );
    expect(updateCall).toBeDefined();
    const [sql] = updateCall!;
    expect(sql).not.toMatch(/updated_by/);
  });
});

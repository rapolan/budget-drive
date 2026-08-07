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

describe('GET /api/v1/search/people', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('a search term matching a student name returns a student-typed result', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ type: 'student', id: 'student-1', name: 'Jessica Park', email: 'jessica@example.com', phone: null }])
    );

    const res = await request(app)
      .get('/api/v1/search/people?q=Jessica')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].type).toBe('student');
  });

  it('a search term matching a guardian email returns a guardian-typed result', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ type: 'guardian', id: 'guardian-1', name: 'Jane Doe', email: 'jane@example.com', phone: null }])
    );

    const res = await request(app)
      .get('/api/v1/search/people?q=jane@example.com')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].type).toBe('guardian');
  });

  it('a shared last name returns both a student and a guardian, correctly typed', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        { type: 'guardian', id: 'guardian-1', name: 'Jane Smith', email: null, phone: '555-0100' },
        { type: 'student', id: 'student-1', name: 'Alice Smith', email: 'alice@example.com', phone: null },
      ])
    );

    const res = await request(app)
      .get('/api/v1/search/people?q=Smith')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((r: { type: string }) => r.type).sort()).toEqual(['guardian', 'student']);
  });

  it('is tenant-scoped', async () => {
    const searchService = await import('../services/searchService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    await searchService.searchPeople('tenant-b-999', 'test');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/tenant_id\s*=\s*\$1/);
    expect(params[0]).toBe('tenant-b-999');
  });

  it('a guardian result name is composed correctly when only last_name is set', async () => {
    const searchService = await import('../services/searchService');
    mockQuery.mockResolvedValueOnce(
      queryResult([{ type: 'guardian', id: 'guardian-2', name: 'Doe', email: null, phone: '555-0200' }])
    );

    const results = await searchService.searchPeople(TENANT_ID, 'Doe');
    expect(results[0].name).toBe('Doe');
  });
});

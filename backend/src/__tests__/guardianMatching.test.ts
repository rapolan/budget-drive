import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc-123';

describe('guardian matching (Constraint B: candidates only, never links)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('findGuardianCandidates matches partial last name case-insensitively', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    await guardianService.findGuardianCandidates(TENANT_ID, { lastName: 'sm' });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ILIKE/);
  });

  it('returns linked student names for a guardian with two students', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'guardian-1',
        tenant_id: TENANT_ID,
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        phone: null,
        linked_student_names: ['Alice Smith', 'Bob Smith'],
      }])
    );

    const candidates = await guardianService.findGuardianCandidates(TENANT_ID, { lastName: 'Smith' });
    expect(candidates[0].linkedStudentNames).toEqual(['Alice Smith', 'Bob Smith']);
  });

  it('returns an empty linkedStudentNames array for a guardian with no links', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'guardian-2',
        tenant_id: TENANT_ID,
        first_name: 'John',
        last_name: 'Doe',
        email: null,
        phone: '555-0100',
        linked_student_names: [],
      }])
    );

    const candidates = await guardianService.findGuardianCandidates(TENANT_ID, { lastName: 'Doe' });
    expect(candidates[0].linkedStudentNames).toEqual([]);
  });

  it('findGuardianCandidates never issues a write query', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    await guardianService.findGuardianCandidates(TENANT_ID, { firstName: 'Jane' });

    for (const [sql] of mockQuery.mock.calls) {
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)/i);
    }
  });

  it('findExactGuardianMatch matches on exact email, not a partial one', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    await guardianService.findExactGuardianMatch(TENANT_ID, { email: 'jane@' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toMatch(/ILIKE/);
    expect(params).toContain('jane@');
  });

  it('findExactGuardianMatch matches on phone when email is absent', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'guardian-3', tenant_id: TENANT_ID, phone: '555-0100' }])
    );

    const matches = await guardianService.findExactGuardianMatch(TENANT_ID, { phone: '555-0100' });
    expect(matches).toHaveLength(1);
  });

  it('is tenant-scoped - never issues a query without a tenant filter', async () => {
    const guardianService = await import('../services/guardianService');
    mockQuery.mockResolvedValueOnce(queryResult([]));

    await guardianService.findGuardianCandidates('tenant-b-999', { lastName: 'Smith' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/tenant_id\s*=\s*\$1/);
    expect(params[0]).toBe('tenant-b-999');
  });
});

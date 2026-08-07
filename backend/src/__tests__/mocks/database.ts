import { vi } from 'vitest';

/**
 * Shared mock for `query()` from `config/database`. Import and register
 * with `vi.mock('../../config/database', () => ({ query: mockQuery }))`
 * at the top of a test file (before any service import), then configure
 * return values per-test with `mockQuery.mockResolvedValueOnce(...)`.
 */
export const mockQuery = vi.fn();

export const resetMockQuery = () => {
  mockQuery.mockReset();
};

export const queryResult = (rows: any[]) => ({
  rows,
  rowCount: rows.length,
});

/**
 * Shared mock for `getClient()` from `config/database`, used by services
 * that run a real BEGIN/COMMIT transaction (e.g. studentGuardianService's
 * primary-guardian promotion). Register alongside mockQuery:
 * `vi.mock('../../config/database', () => ({ query: mockQuery, getClient: mockGetClient }))`
 * then configure `mockClientQuery.mockResolvedValueOnce(...)` per-call in
 * BEGIN/UPDATE/UPDATE/COMMIT order.
 */
export const mockClientQuery = vi.fn();
export const mockClientRelease = vi.fn();
export const mockGetClient = vi.fn(async () => ({
  query: mockClientQuery,
  release: mockClientRelease,
}));

export const resetMockClient = () => {
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockGetClient.mockClear();
};

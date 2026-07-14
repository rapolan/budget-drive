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

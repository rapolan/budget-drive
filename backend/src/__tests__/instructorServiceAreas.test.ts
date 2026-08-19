import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';

describe('instructorServiceAreaService', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  describe('getServiceAreas', () => {
    it('returns an empty list for an instructor with no configured rows (not an error)', async () => {
      const { getServiceAreas } = await import('../services/instructorServiceAreaService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      const result = await getServiceAreas(INSTRUCTOR_ID, TENANT_ID);

      expect(result).toEqual([]);
    });

    it('returns the configured zips sorted', async () => {
      const { getServiceAreas } = await import('../services/instructorServiceAreaService');
      mockQuery.mockResolvedValueOnce(queryResult([{ zip_code: '90001' }, { zip_code: '90002' }]));

      const result = await getServiceAreas(INSTRUCTOR_ID, TENANT_ID);

      expect(result).toEqual(['90001', '90002']);
    });
  });

  describe('getServiceAreasForInstructorsBatch', () => {
    it('groups multiple instructors\' rows from a single query', async () => {
      const { getServiceAreasForInstructorsBatch } = await import('../services/instructorServiceAreaService');
      mockQuery.mockResolvedValueOnce(
        queryResult([
          { instructor_id: 'instructor-1', zip_code: '90001' },
          { instructor_id: 'instructor-1', zip_code: '90002' },
          { instructor_id: 'instructor-2', zip_code: '91101' },
        ])
      );

      const result = await getServiceAreasForInstructorsBatch(['instructor-1', 'instructor-2', 'instructor-3'], TENANT_ID);

      expect(result.get('instructor-1')).toEqual(['90001', '90002']);
      expect(result.get('instructor-2')).toEqual(['91101']);
      // instructor-3 has zero rows configured - absent from the Map entirely,
      // which is the Constraint B "serves everywhere" signal callers rely on.
      expect(result.has('instructor-3')).toBe(false);
    });

    it('returns an empty Map without querying when given no instructor ids', async () => {
      const { getServiceAreasForInstructorsBatch } = await import('../services/instructorServiceAreaService');

      const result = await getServiceAreasForInstructorsBatch([], TENANT_ID);

      expect(result.size).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('setServiceAreas', () => {
    it('persists a valid list inside a DELETE-then-INSERT transaction', async () => {
      const { setServiceAreas } = await import('../services/instructorServiceAreaService');

      mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])); // instructor check

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockResolvedValueOnce(queryResult([])) // DELETE
        .mockResolvedValueOnce(queryResult([])) // INSERT
        .mockResolvedValueOnce(queryResult([])); // COMMIT

      const result = await setServiceAreas(INSTRUCTOR_ID, TENANT_ID, ['90002', '90001']);

      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql as string);
      expect(clientCalls[0]).toBe('BEGIN');
      expect(clientCalls.some((sql) => sql.includes('DELETE FROM instructor_service_areas'))).toBe(true);
      expect(clientCalls.some((sql) => sql.includes('INSERT INTO instructor_service_areas'))).toBe(true);
      expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
      expect(result).toEqual(['90001', '90002']);
    });

    it('replacing with an empty list only deletes - no INSERT is issued', async () => {
      const { setServiceAreas } = await import('../services/instructorServiceAreaService');

      mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]));

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockResolvedValueOnce(queryResult([])) // DELETE
        .mockResolvedValueOnce(queryResult([])); // COMMIT

      const result = await setServiceAreas(INSTRUCTOR_ID, TENANT_ID, []);

      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql as string);
      expect(clientCalls.some((sql) => sql.includes('INSERT INTO instructor_service_areas'))).toBe(false);
      expect(result).toEqual([]);
    });

    it.each(['921', 'abcde', '921011', '9210a'])(
      'rejects an invalid ZIP (%s) with 400 before opening a transaction',
      async (badZip) => {
        const { setServiceAreas } = await import('../services/instructorServiceAreaService');
        mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]));

        await expect(setServiceAreas(INSTRUCTOR_ID, TENANT_ID, [badZip])).rejects.toThrow(/not a valid 5-digit ZIP/);

        expect(mockGetClient).not.toHaveBeenCalled();
      }
    );

    it('rejects a duplicate ZIP entry with 400 before opening a transaction', async () => {
      const { setServiceAreas } = await import('../services/instructorServiceAreaService');
      mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]));

      await expect(setServiceAreas(INSTRUCTOR_ID, TENANT_ID, ['90001', '90001'])).rejects.toThrow(/Duplicate ZIP code/);

      expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('rejects when the instructor does not belong to the tenant', async () => {
      const { setServiceAreas } = await import('../services/instructorServiceAreaService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await expect(setServiceAreas(INSTRUCTOR_ID, TENANT_ID, ['90001'])).rejects.toThrow(/Instructor not found/);

      expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('rolls back the whole transaction if a write fails partway through', async () => {
      const { setServiceAreas } = await import('../services/instructorServiceAreaService');
      mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]));

      mockClientQuery
        .mockResolvedValueOnce(queryResult([])) // BEGIN
        .mockRejectedValueOnce(new Error('simulated DB failure')); // DELETE blows up

      await expect(setServiceAreas(INSTRUCTOR_ID, TENANT_ID, ['90001'])).rejects.toThrow('simulated DB failure');

      const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql as string);
      expect(clientCalls).toContain('ROLLBACK');
      expect(clientCalls).not.toContain('COMMIT');
    });
  });
});

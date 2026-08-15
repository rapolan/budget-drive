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

function blankWeek(overrides: Partial<{ dayOfWeek: number; isActive: boolean; startTime: string; endTime: string; maxStudents: number | null }>[] = []) {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isActive: false as const }));
  for (const override of overrides) {
    const idx = days.findIndex((d) => d.dayOfWeek === override.dayOfWeek);
    days[idx] = { ...days[idx], ...override } as (typeof days)[number];
  }
  return days;
}

describe('setWeekAvailability', () => {
  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  it('rejects a payload missing a day of week', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');
    mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])); // instructor check

    const incompleteWeek = blankWeek().slice(0, 6); // only 6 days

    await expect(
      setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, incompleteWeek)
    ).rejects.toThrow(/exactly one entry for every day/);

    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a working day with startTime >= endTime, before opening a transaction', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');
    mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])); // instructor check

    const invalidWeek = blankWeek([
      { dayOfWeek: 1, isActive: true, startTime: '17:00', endTime: '09:00', maxStudents: 3 },
    ]);

    await expect(
      setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, invalidWeek)
    ).rejects.toThrow(/Day 1: startTime must be before endTime/);

    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a duplicate day of week entry', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');
    mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]));

    const week = blankWeek();
    const duped = [...week, { dayOfWeek: 1, isActive: false }];

    await expect(
      setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, duped)
    ).rejects.toThrow(/duplicate entry/);

    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects when the instructor does not belong to the tenant', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');
    mockQuery.mockResolvedValueOnce(queryResult([])); // instructor check: not found

    await expect(
      setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, blankWeek())
    ).rejects.toThrow(/Instructor not found/);

    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('inserts a new row for a working day with no existing active row', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
      .mockResolvedValueOnce(queryResult([])); // final getInstructorAvailability refresh

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // day 0 select: none, inactive -> no-op
      .mockResolvedValueOnce(queryResult([])) // day 1 select: none
      .mockResolvedValueOnce(queryResult([{ id: 'new-row' }])) // day 1 INSERT
      .mockResolvedValueOnce(queryResult([])) // day 2 select: none
      .mockResolvedValueOnce(queryResult([])) // day 3 select: none
      .mockResolvedValueOnce(queryResult([])) // day 4 select: none
      .mockResolvedValueOnce(queryResult([])) // day 5 select: none
      .mockResolvedValueOnce(queryResult([])) // day 6 select: none
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const week = blankWeek([
      { dayOfWeek: 1, isActive: true, startTime: '09:00', endTime: '17:00', maxStudents: 3 },
    ]);

    await setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, week);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql as string);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls.some((sql) => sql.includes('INSERT INTO instructor_availability'))).toBe(true);
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
  });

  it('updates an existing active row in place, preserving its id, when the day stays active', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');
    const EXISTING_ROW_ID = 'existing-monday-row';

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]))
      .mockResolvedValueOnce(queryResult([]));

    // 1 BEGIN + 7 selects, but only day 1 finds a row - simplest way to model
    // this without hand-counting every day: mock every select as "none" then
    // override day 1's slot specifically via mockImplementationOnce ordering.
    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // day 0 select
      .mockResolvedValueOnce(queryResult([{ id: EXISTING_ROW_ID }])) // day 1 select: found
      .mockResolvedValueOnce(queryResult([])) // day 1 UPDATE
      .mockResolvedValueOnce(queryResult([])) // day 2 select
      .mockResolvedValueOnce(queryResult([])) // day 3 select
      .mockResolvedValueOnce(queryResult([])) // day 4 select
      .mockResolvedValueOnce(queryResult([])) // day 5 select
      .mockResolvedValueOnce(queryResult([])) // day 6 select
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const week = blankWeek([
      { dayOfWeek: 1, isActive: true, startTime: '08:00', endTime: '14:00', maxStudents: 2 },
    ]);

    await setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, week);

    const updateCall = mockClientQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('UPDATE instructor_availability') && (sql as string).includes('start_time')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['08:00', '14:00', 2, EXISTING_ROW_ID]);
  });

  it('deactivates an existing row without deleting it when a previously-working day is unchecked', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');
    const EXISTING_ROW_ID = 'existing-friday-row';

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]))
      .mockResolvedValueOnce(queryResult([]));

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // day 0
      .mockResolvedValueOnce(queryResult([])) // day 1
      .mockResolvedValueOnce(queryResult([])) // day 2
      .mockResolvedValueOnce(queryResult([])) // day 3
      .mockResolvedValueOnce(queryResult([])) // day 4
      .mockResolvedValueOnce(queryResult([{ id: EXISTING_ROW_ID }])) // day 5 select: found
      .mockResolvedValueOnce(queryResult([])) // day 5 UPDATE (deactivate)
      .mockResolvedValueOnce(queryResult([])) // day 6
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const week = blankWeek([{ dayOfWeek: 5, isActive: false }]);

    await setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, week);

    const deactivateCall = mockClientQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('is_active = false')
    );
    expect(deactivateCall).toBeDefined();
    expect(deactivateCall![1]).toEqual([EXISTING_ROW_ID]);

    // Never a DELETE statement anywhere in the transaction.
    const deleteCall = mockClientQuery.mock.calls.find(([sql]) => (sql as string).includes('DELETE'));
    expect(deleteCall).toBeUndefined();
  });

  it('rolls back the whole transaction if a write fails partway through, so no partial week is saved', async () => {
    const { setWeekAvailability } = await import('../services/availabilityService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }]));

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([])) // day 0 select
      .mockRejectedValueOnce(new Error('simulated DB failure')); // day 1 select blows up

    const week = blankWeek([
      { dayOfWeek: 1, isActive: true, startTime: '09:00', endTime: '17:00', maxStudents: 3 },
    ]);

    await expect(setWeekAvailability(TENANT_ID, INSTRUCTOR_ID, week)).rejects.toThrow('simulated DB failure');

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql as string);
    expect(clientCalls).toContain('ROLLBACK');
    expect(clientCalls).not.toContain('COMMIT');
  });
});

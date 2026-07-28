import { describe, it, expect } from 'vitest';
import { CONFLICT_MESSAGES, getConflictMessage } from '../conflictMessages';
import type { SchedulingConflict } from '@/types';

const ALL_CONFLICT_TYPES: SchedulingConflict['type'][] = [
  'instructor_busy',
  'vehicle_busy',
  'student_busy',
  'outside_working_hours',
  'time_off',
  'buffer_violation',
  'capacity_reached',
];

describe('CONFLICT_MESSAGES', () => {
  it('has an entry for every known SchedulingConflict type', () => {
    for (const type of ALL_CONFLICT_TYPES) {
      expect(CONFLICT_MESSAGES[type]).toBeTypeOf('string');
      expect(CONFLICT_MESSAGES[type].length).toBeGreaterThan(0);
    }
  });
});

describe('getConflictMessage', () => {
  it.each(ALL_CONFLICT_TYPES)('maps conflictType "%s" to its friendly message', (type) => {
    const fallback = 'raw backend message';
    expect(getConflictMessage(type, fallback)).toBe(CONFLICT_MESSAGES[type]);
  });

  it('falls back to the raw message for an unknown conflictType', () => {
    const fallback = 'Scheduling conflict: something unexpected happened';
    expect(getConflictMessage('some_unrecognized_code', fallback)).toBe(fallback);
  });

  it('falls back to the raw message when conflictType is undefined', () => {
    const fallback = 'Failed to create lesson';
    expect(getConflictMessage(undefined, fallback)).toBe(fallback);
  });
});

import { describe, it, expect } from 'vitest';
import {
  extractZipCode,
  getEffectiveZipCode,
  getZipRegion,
  calculateProximityScore,
  sortByProximity,
} from '../zipCode';

describe('extractZipCode', () => {
  it('extracts a bare 5-digit zip', () => {
    expect(extractZipCode('90210')).toBe('90210');
  });

  it('extracts a zip embedded in a full address', () => {
    expect(extractZipCode('555 Maple Ave, Los Angeles, CA 90008')).toBe('90008');
  });

  it('extracts the 5-digit portion of a zip+4', () => {
    expect(extractZipCode('90210-1234')).toBe('90210');
  });

  it('returns null when no zip is present', () => {
    expect(extractZipCode('555 Maple Ave, Los Angeles, CA')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(extractZipCode(null)).toBeNull();
    expect(extractZipCode(undefined)).toBeNull();
    expect(extractZipCode('')).toBeNull();
  });
});

describe('getEffectiveZipCode', () => {
  it('prefers a zip extracted from the pickup address', () => {
    expect(getEffectiveZipCode('123 Main St, LA, CA 90001', '90099')).toBe('90001');
  });

  it('falls back to the student zip when the address has none', () => {
    expect(getEffectiveZipCode('123 Main St, LA, CA', '90099')).toBe('90099');
  });

  it('returns null when neither source has a zip', () => {
    expect(getEffectiveZipCode(null, undefined)).toBeNull();
  });
});

describe('getZipRegion', () => {
  it('maps a known LA prefix to its region', () => {
    expect(getZipRegion('90008')).toBe('LA_CENTRAL');
  });

  it('maps a known SF prefix to its region', () => {
    expect(getZipRegion('94102')).toBe('SF');
  });

  it('returns UNKNOWN for an unmapped prefix', () => {
    expect(getZipRegion('10001')).toBe('UNKNOWN'); // NYC, not in the CA table
  });

  it('returns UNKNOWN for missing or too-short input', () => {
    expect(getZipRegion(null)).toBe('UNKNOWN');
    expect(getZipRegion('90')).toBe('UNKNOWN');
  });
});

describe('calculateProximityScore', () => {
  it('scores an exact zip match as 100', () => {
    expect(calculateProximityScore('90008', '90008')).toBe(100);
  });

  it('scores the same region (different zip) as 70', () => {
    // 900 and 902 are both LA_CENTRAL
    expect(calculateProximityScore('90008', '90210')).toBe(70);
  });

  it('scores adjacent regions as 50', () => {
    // LA_CENTRAL (900) and LA_WEST (907) are adjacent per the adjacency table
    expect(calculateProximityScore('90008', '90703')).toBe(50);
  });

  it('scores different, non-adjacent regions as 30', () => {
    // LA_CENTRAL (900) vs SF (941) - not adjacent
    expect(calculateProximityScore('90008', '94102')).toBe(30);
  });

  it('scores 50 (neutral) when either zip is missing', () => {
    expect(calculateProximityScore(null, '90008')).toBe(50);
    expect(calculateProximityScore('90008', undefined)).toBe(50);
  });

  it('scores 50 (neutral) when either zip is in an unknown region', () => {
    expect(calculateProximityScore('10001', '90008')).toBe(50);
  });
});

describe('sortByProximity', () => {
  it('sorts items descending by proximity score to the target zip', () => {
    const items = [
      { id: 'far', lastLessonZip: '94102' }, // SF - far from 90008
      { id: 'exact', lastLessonZip: '90008' }, // exact match
      { id: 'same-region', lastLessonZip: '90210' }, // same region
    ];

    const sorted = sortByProximity(items, '90008');

    expect(sorted.map((i) => i.id)).toEqual(['exact', 'same-region', 'far']);
  });

  it('returns the items unchanged (same reference) when targetZip is falsy', () => {
    const items = [{ id: 'a', lastLessonZip: '90008' }];
    expect(sortByProximity(items, undefined)).toBe(items);
    expect(sortByProximity(items, null)).toBe(items);
    expect(sortByProximity(items, '')).toBe(items);
  });
});

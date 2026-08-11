import { describe, it, expect } from 'vitest';
import { bucketTimePreference } from './timePreferenceBucket';

describe('bucketTimePreference', () => {
  it('buckets the start of the morning window (6:00) as morning', () => {
    expect(bucketTimePreference('06:00')).toBe('morning');
  });

  it('buckets the end of the morning window (11:59) as morning', () => {
    expect(bucketTimePreference('11:59')).toBe('morning');
  });

  it('buckets the start of the afternoon window (12:00) as afternoon', () => {
    expect(bucketTimePreference('12:00')).toBe('afternoon');
  });

  it('buckets the end of the afternoon window (16:59) as afternoon', () => {
    expect(bucketTimePreference('16:59')).toBe('afternoon');
  });

  it('buckets the start of the evening window (17:00) as evening', () => {
    expect(bucketTimePreference('17:00')).toBe('evening');
  });

  it('buckets the end of the evening window (20:59) as evening', () => {
    expect(bucketTimePreference('20:59')).toBe('evening');
  });

  it('buckets a time at or after 21:00 as any (no night bucket exists)', () => {
    expect(bucketTimePreference('21:00')).toBe('any');
    expect(bucketTimePreference('23:30')).toBe('any');
  });

  it('buckets a time before 6am as any', () => {
    expect(bucketTimePreference('03:00')).toBe('any');
    expect(bucketTimePreference('05:59')).toBe('any');
  });

  it('accepts HH:MM:SS as well as HH:MM', () => {
    expect(bucketTimePreference('14:30:00')).toBe('afternoon');
  });

  it('returns any for a null, undefined, or empty time', () => {
    expect(bucketTimePreference(null)).toBe('any');
    expect(bucketTimePreference(undefined)).toBe('any');
    expect(bucketTimePreference('')).toBe('any');
  });
});

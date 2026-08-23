import { describe, it, expect } from 'vitest';
import { getStudentContactDisplay } from './studentContact';

describe('getStudentContactDisplay', () => {
  it('returns the student\'s own email/phone when present, not a guardian fallback', () => {
    const result = getStudentContactDisplay({
      email: 'student@example.com',
      phone: '555-1111',
      primaryGuardian: { id: 'g1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '555-2222' },
    });
    expect(result).toEqual({ email: 'student@example.com', phone: '555-1111', isGuardianFallback: false });
  });

  it('falls back to the guardian\'s contact when the minor has neither email nor phone', () => {
    const result = getStudentContactDisplay({
      email: undefined,
      phone: null,
      primaryGuardian: { id: 'g1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '555-2222' },
    });
    expect(result).toEqual({ email: 'jane@example.com', phone: '555-2222', isGuardianFallback: true });
  });

  it('uses the student\'s own phone alone without triggering the guardian fallback', () => {
    const result = getStudentContactDisplay({
      email: undefined,
      phone: '555-1111',
      primaryGuardian: { id: 'g1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '555-2222' },
    });
    expect(result).toEqual({ email: null, phone: '555-1111', isGuardianFallback: false });
  });

  it('returns all-null with no fallback when the minor has no guardian linked at all', () => {
    const result = getStudentContactDisplay({ email: undefined, phone: null, primaryGuardian: undefined });
    expect(result).toEqual({ email: null, phone: null, isGuardianFallback: false });
  });

  it('returns all-null with no fallback when the guardian itself has no contact info', () => {
    const result = getStudentContactDisplay({
      email: undefined,
      phone: null,
      primaryGuardian: { id: 'g1', firstName: 'Jane', lastName: 'Doe', email: null, phone: null },
    });
    expect(result).toEqual({ email: null, phone: null, isGuardianFallback: false });
  });
});

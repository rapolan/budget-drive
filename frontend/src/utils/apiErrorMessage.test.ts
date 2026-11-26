import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from './apiErrorMessage';

describe('apiErrorMessage', () => {
  it('extracts the backend error string from an axios-shaped rejection', () => {
    const err = { response: { data: { error: 'Something went wrong' } } };
    expect(apiErrorMessage(err, 'fallback')).toBe('Something went wrong');
  });

  it('falls back when the shape is missing entirely (e.g. a network error)', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toBe('fallback');
  });

  it('falls back when response.data.error is empty', () => {
    const err = { response: { data: { error: '' } } };
    expect(apiErrorMessage(err, 'fallback')).toBe('fallback');
  });

  it('falls back for a non-object rejection', () => {
    expect(apiErrorMessage('a plain string rejection', 'fallback')).toBe('fallback');
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

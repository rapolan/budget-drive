import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionState } from './useSessionState';

// Regression: Lessons.tsx (and Instructors/Payments/Students/Vehicles.tsx)
// all held their table/cards/calendar/weekly view toggle in plain
// useState, so switching to a non-default view, navigating away, and
// coming back silently reset it to 'table' every time. This hook fixes
// that by persisting to sessionStorage. (sessionStorage is cleared after
// every test globally - see src/test/setup.ts.)

describe('useSessionState', () => {
  it('starts at defaultValue when nothing is stored yet', () => {
    const { result } = renderHook(() => useSessionState('test-key', 'table'));
    expect(result.current[0]).toBe('table');
  });

  it('persists the value to sessionStorage and restores it on the next mount', () => {
    const { result, unmount } = renderHook(() =>
      useSessionState<'table' | 'weekly'>('lessons-view-mode', 'table')
    );

    act(() => {
      result.current[1]('weekly');
    });
    expect(result.current[0]).toBe('weekly');
    expect(window.sessionStorage.getItem('lessons-view-mode')).toBe('weekly');

    unmount();

    // Simulates navigating away and back - a fresh mount of the same hook
    // with the same key should restore the persisted value, not reset to
    // the default.
    const { result: result2 } = renderHook(() =>
      useSessionState<'table' | 'weekly'>('lessons-view-mode', 'table')
    );
    expect(result2.current[0]).toBe('weekly');
  });

  it('falls back to defaultValue when the stored value fails the isValid check', () => {
    window.sessionStorage.setItem('view-mode-key', 'some-removed-view');
    const isValid = (v: string): v is 'table' | 'cards' => v === 'table' || v === 'cards';

    const { result } = renderHook(() => useSessionState('view-mode-key', 'table', isValid));
    expect(result.current[0]).toBe('table');
  });

  it('keeps updating in-memory state even if sessionStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useSessionState<'table' | 'cards'>('quota-test-key', 'table'));
    act(() => {
      result.current[1]('cards');
    });
    expect(result.current[0]).toBe('cards');

    setItemSpy.mockRestore();
  });

  it('different keys do not collide with each other', () => {
    const { result: a } = renderHook(() => useSessionState<'table' | 'cards'>('page-a-view', 'table'));
    const { result: b } = renderHook(() => useSessionState<'table' | 'cards'>('page-b-view', 'table'));

    act(() => {
      a.current[1]('cards');
    });

    expect(a.current[0]).toBe('cards');
    expect(b.current[0]).toBe('table');
  });
});

import { useState, useCallback } from 'react';

/**
 * Like useState, but the value is persisted to sessionStorage under `key`
 * and restored on the next mount within the same browser tab/session -
 * e.g. a page's table/cards/calendar view toggle staying where the admin
 * left it after navigating away and back, without surviving a full browser
 * restart (that would be localStorage instead, a deliberately different
 * and stronger persistence guarantee this hook does not make).
 *
 * Every call site should use a distinct, page-scoped key (e.g.
 * 'lessons-view-mode') - this hook does no namespacing of its own.
 *
 * @param key - sessionStorage key to persist under
 * @param defaultValue - value used when nothing is stored yet, or storage
 *   is unavailable, or the stored value fails the optional `isValid` check
 * @param isValid - optional guard against a stored value that no longer
 *   matches the type's current valid set (e.g. a view mode removed in a
 *   later release) - falls back to defaultValue rather than rendering with
 *   a value the UI doesn't know how to handle
 *
 * @example
 * const [viewMode, setViewMode] = useSessionState<ViewMode>(
 *   'lessons-view-mode',
 *   'table',
 *   (v): v is ViewMode => ['table', 'cards', 'calendar', 'weekly'].includes(v as ViewMode)
 * );
 */
export function useSessionState<T extends string>(
  key: string,
  defaultValue: T,
  isValid?: (value: string) => value is T
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored === null) return defaultValue;
      if (isValid && !isValid(stored)) return defaultValue;
      return stored as T;
    } catch {
      // sessionStorage unavailable (e.g. private browsing, SSR) - behave
      // like plain useState for the remainder of this session.
      return defaultValue;
    }
  });

  // Stable across renders (useState's own setter is too) - existing
  // useEffect/useCallback dependency arrays that already listed the old
  // useState setter keep working unchanged, and eslint-plugin-react-hooks
  // doesn't flag it as a missing dependency.
  const setPersistedState = useCallback((value: T) => {
    setState(value);
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Storage full or unavailable - the in-memory state above still
      // updates, so the UI keeps working for the rest of this session,
      // it just won't survive a remount.
    }
  }, [key]);

  return [state, setPersistedState];
}

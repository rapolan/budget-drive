import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom's sessionStorage persists across tests within the same file (it's
// not reset between renders the way component state is) - useSessionState
// (Lessons/Instructors/Payments/Students/Vehicles view-mode toggles) writes
// through to it, so one test switching to a non-default view leaked into
// every later test in the file, which then failed looking for
// default-view-only content. Clearing after each test isolates them again.
afterEach(() => {
  window.sessionStorage.clear();
});

// jsdom implements neither of these - several components call
// window.matchMedia('(prefers-reduced-motion: reduce)') and
// Element.scrollIntoView() for auto-scroll behavior (StudentModal,
// Students.tsx, Instructors.tsx, Lessons.tsx). Without these stubs, any
// test that exercises that code path throws "is not a function" from deep
// inside a useEffect, often failing an unrelated later test in the same
// file rather than the one that actually triggered it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList);
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

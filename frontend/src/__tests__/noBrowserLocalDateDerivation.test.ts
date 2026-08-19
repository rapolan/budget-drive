import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Frontend counterpart to backend/src/__tests__/noServerLocalDateDerivation.test.ts
// (Constraint B, mirrored client-side). Every file the frontend browser-time
// audit touched (docs/ARCHITECTURE.md §7) must never derive a date/wall-clock
// value from the BROWSER's own clock - only ever from a tenant-resolved value
// already threaded through (tenantNow, startTimeLocal/endTimeLocal, etc.).
//
// Uses import.meta.url + node:path instead of __dirname so this typechecks
// under the frontend's ESM tsconfig, and deliberately does NOT resolve a
// relative URL against import.meta.url - see progressCalculationOwnership.test.ts
// for why (jsdom shadows the global URL constructor).
//
// Forbidden patterns (a date/wall-clock value derived from BROWSER-local
// time instead of a tenant-resolved value):
//   - toISOString().split('T'  - reads the UTC calendar date, not tenant's
//   - .getFullYear() / .getMonth() / .getDate() / .getDay()  - browser-local
//     calendar getters
//   - .getHours() / .getMinutes()  - browser-local wall-clock getters
//     (frontend-specific: the SmartBookingForm/TodaysScheduleWidget bug class,
//     not present in the backend's version of this test)
//   - bare `new Date()` with no arguments - the browser-"now" pattern
//
// Each forbidden pattern may appear on an ALLOWLISTED line only - a line
// documented inline (in the source file itself) as a legitimate use. The
// two recurring legitimate categories across these files:
//   (a) Calendar-day arithmetic on a Date that was itself already built
//       from a tenant-resolved YYYY-MM-DD string (via parseLocalDate) or
//       copy-constructed from such a Date - reading .getDay()/.getDate()/
//       .setDate() on it is pure calendar-grid math, not a fresh read of
//       the browser's instant. This is the same reasoning documented in
//       frontend/src/utils/timeFormat.ts's own parseLocalDate/
//       formatLocalDate/addCalendarDays.
//   (b) timeFormat.ts's own primitives, which are the safe building blocks
//       every other file in this list calls instead of touching Date
//       directly - they are the ONE place this arithmetic legitimately
//       happens, mirroring tenantTime.ts's role on the backend.
//
// Dashboard.tsx and studentStatus.ts (per docs/ARCHITECTURE.md §7's
// pre-hydration/required-parameter decisions) must never contain a
// browser-Date FALLBACK or a defaulted `now` parameter - but calendar-grid
// math under category (a) on an already tenant-anchored Date is still
// legitimate in Dashboard.tsx and is allowlisted below like any other file;
// what's categorically absent is any `new Date()` used as a placeholder
// value or default parameter.

const TARGET_FILES = [
  'src/pages/Dashboard.tsx',
  'src/pages/Lessons.tsx',
  'src/components/lessons/LessonsCalendarView.tsx',
  'src/components/scheduling/InstructorWeeklySchedule.tsx',
  'src/utils/studentStatus.ts',
  'src/components/lessons/TodaysScheduleWidget.tsx',
  'src/components/common/DateRangeFilter.tsx',
  'src/components/scheduling/SmartBookingForm/index.tsx',
  'src/utils/timeFormat.ts',
];

const testDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(testDir, '..', '..', relativePath), 'utf8');
}

// Per-file allowlisted line snippets - a forbidden-pattern match is only
// permitted on a line that contains one of these exact substrings.
const ALLOWLIST: Record<string, string[]> = {
  'src/pages/Dashboard.tsx': [
    // Category (a): renders the day-of-month number for a calendar-grid
    // cell whose Date was built via parseLocalDate(dateStr) from a
    // tenant-resolved string a few lines above - not a fresh browser read.
    `return date.getDate();`,
  ],
  'src/pages/Lessons.tsx': [
    // Category (a): `date` here is the Date already passed into
    // handleWeeklyBookSlot by InstructorWeeklySchedule, itself built from
    // tenantNow-anchored calendar arithmetic - adding 2 hours of wall-clock
    // time to an already-resolved local Date and reading it back is pure
    // clock-face math, not a browser-instant parse.
    `const endTime = \`\${endDateTime.getHours().toString().padStart(2, '0')}:\${endDateTime.getMinutes().toString().padStart(2, '0')}\`;`,
  ],
  'src/components/lessons/LessonsCalendarView.tsx': [
    // Category (a): currentDate/currentMonth/currentYear are seeded from
    // tenantNow.today (via parseLocalDate) or user month-navigation on top
    // of that seed - never a fresh new Date().
    `const currentMonth = currentDate.getMonth();`,
    `const currentYear = currentDate.getFullYear();`,
    // Building the visible month grid's day count/weekday-offset from
    // currentYear/currentMonth (both tenant-anchored, see above) - pure
    // calendar math, not a browser clock read.
    `const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();`,
    `const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();`,
    `const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();`,
    // date here is a grid-cell Date built from the same tenant-anchored
    // year/month above.
    `const dayOfWeek = date.getDay();`,
    `const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday`,
    // .getDay() here reads a Date built from tenantNow.today via
    // parseLocalDate a few lines above - category (a), not a browser read.
    `tenantToday.getDay() === idx &&`,
    `tenantToday.getMonth() === currentMonth &&`,
    `tenantToday.getFullYear() === currentYear;`,
  ],
  'src/components/scheduling/InstructorWeeklySchedule.tsx': [
    // Category (a): weekEnd is a copy of currentWeekStart (itself seeded
    // from tenantNow.weekStart) with 6 days added - calendar arithmetic on
    // an already tenant-anchored Date, not a browser clock read.
    `end.setDate(end.getDate() + 6);`,
    // date here is a per-day copy of currentWeekStart (tenant-anchored)
    // advanced by a loop offset - used only to read the resulting weekday
    // for availability lookup.
    `date.setDate(date.getDate() + dayOffset);`,
    `const dayOfWeek = date.getDay();`,
    // dateStr comes from addCalendarDays on the tenant-anchored week start;
    // parsing it back with parseLocalDate and reading .getDay() is the same
    // category-(a) calendar math documented in LessonsCalendarView.tsx.
    `const dayOfWeek = parseLocalDate(dateStr).getDay();`,
    `const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday`,
    `dayNumber: date.getDate(),`,
    // Navigation: newDate/end/currentWeekStart are all tenant-anchored
    // Dates being advanced by a fixed calendar-day offset, never a fresh
    // browser read.
    `newDate.setDate(newDate.getDate() - 7);`,
    `end.setDate(end.getDate() + 6);`,
    `const startDay = currentWeekStart.getDate();`,
    `const endDay = end.getDate();`,
    `const year = currentWeekStart.getFullYear();`,
    // Compare-mode day header grid: date is a per-column copy of
    // currentWeekStart (tenant-anchored) advanced by the column's offset.
    `date.setDate(date.getDate() + i);`,
    `<div>{DAYS_OF_WEEK[date.getDay()].slice(0, 3)}</div>`,
    `{date.getDate()}`,
    `date.setDate(date.getDate() + dayIndex);`,
  ],
  'src/utils/studentStatus.ts': [],
  'src/components/lessons/TodaysScheduleWidget.tsx': [],
  'src/components/common/DateRangeFilter.tsx': [],
  'src/components/scheduling/SmartBookingForm/index.tsx': [],
  'src/utils/timeFormat.ts': [
    // parseLocalDate/formatLocalDate/addCalendarDays are the module's own
    // primitives - the ONE place this arithmetic legitimately happens on an
    // already-unambiguous, already-resolved date string, so every other
    // file in this list can call them instead of touching Date itself.
    `const year = date.getFullYear();`,
    `const month = String(date.getMonth() + 1).padStart(2, '0');`,
    `const day = String(date.getDate()).padStart(2, '0');`,
    `date.setDate(date.getDate() + days);`,
  ],
};

const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: `toISOString().split('T'`, pattern: /toISOString\(\)\.split\('T'/g },
  { name: '.getFullYear()', pattern: /\.getFullYear\(\)/g },
  { name: '.getMonth()', pattern: /\.getMonth\(\)/g },
  { name: '.getDate()', pattern: /\.getDate\(\)/g },
  { name: '.getDay()', pattern: /\.getDay\(\)/g },
  { name: '.getHours()', pattern: /\.getHours\(\)/g },
  { name: '.getMinutes()', pattern: /\.getMinutes\(\)/g },
  { name: 'bare new Date()', pattern: /new Date\(\)/g },
];

describe('no browser-local date derivation (frontend Constraint B mirror)', () => {
  for (const file of TARGET_FILES) {
    it(`${file}: every forbidden-pattern match is on an allowlisted line`, () => {
      const source = readSource(file);
      const lines = source.split('\n');
      const allowlist = ALLOWLIST[file] ?? [];

      const violations: string[] = [];

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Skip comment lines - this test scans executable code for the
        // forbidden patterns, not prose that mentions them while
        // documenting the rule itself.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        for (const { name, pattern } of FORBIDDEN_PATTERNS) {
          pattern.lastIndex = 0;
          if (!pattern.test(line)) continue;

          const isAllowlisted = allowlist.some((snippet) => line.includes(snippet));
          if (!isAllowlisted) {
            violations.push(`line ${index + 1} (${name}): ${line.trim()}`);
          }
        }
      });

      expect(violations, `${file} has non-allowlisted browser-local date derivation:\n${violations.join('\n')}`).toEqual([]);
    });
  }

  it('every allowlisted snippet still exists verbatim in its file (catches stale allowlist entries)', () => {
    for (const [file, snippets] of Object.entries(ALLOWLIST)) {
      const source = readSource(file);
      for (const snippet of snippets) {
        expect(source, `${file}'s allowlist references a snippet no longer present: ${snippet}`).toContain(snippet);
      }
    }
  });
});

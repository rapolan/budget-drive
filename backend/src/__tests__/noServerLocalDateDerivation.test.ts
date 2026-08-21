import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Item 9's structural test (Constraint B enforcement). Mirrors
// guardianMatching.test.ts's "spy on a mechanism, assert a forbidden
// pattern is absent" technique and frontend/src/__tests__/
// progressCalculationOwnership.test.ts's static-source-read variant of the
// same idea, applied here to every backend file items 1-6 touched (plus
// tenantTime.ts itself, which is exempt from its OWN rule since it's where
// the real Date-object work legitimately happens, but is still checked for
// toISOString().split('T' misuse since that specific pattern is banned
// everywhere, including inside the helper module).
//
// Forbidden patterns (a date/wall-clock value derived from PROCESS-local
// time instead of the tenant-timezone helper module):
//   - toISOString().split('T'  - reads the UTC calendar date, not tenant's
//   - .getFullYear() / .getMonth() / .getDate() / .getDay()  - process-local
//     calendar getters (word-boundaried; getDate() excludes getDayOfWeek
//     and similar identifiers via strict method-call matching)
//   - bare `new Date()` with no arguments - the server-"now" pattern
//
// Each forbidden pattern may appear on an ALLOWLISTED line only - a line
// documented inline (in the source file itself) as a legitimate use:
//   1. Comparing a real UTC instant against "now" (an instant has no
//      timezone - lessonService.ts's reminder-scheduling comparisons).
//   2. RFC 5545 DTSTAMP (a UTC creation timestamp, also instant-based) -
//      lessonInviteService.ts / calendarFeedService.ts.
//   3. Extracting the calendar date from a plain Postgres DATE column
//      value (no time component - a Date from `pg` for such a column is
//      always UTC midnight of that calendar date, so toISOString().split
//      is safe specifically here) - schedulingService.ts, lessonService.ts,
//      lessonInviteService.ts, calendarFeedService.ts.
//   4. tenantTime.ts's own `reference: Date = new Date()` default
//      parameters (the primitive that legitimately reads real "now" so
//      every OTHER file never has to).
//
// Each allowlist entry below is a literal source snippet (not a regex) -
// the test greps for the forbidden pattern, then requires every matching
// line to contain one of the file's allowlisted snippets. A match on a
// non-allowlisted line fails the test - this is the enforcement.

const TARGET_FILES = [
  'src/services/schedulingService.ts',
  'src/services/lessonService.ts',
  'src/services/lessonInviteService.ts',
  'src/services/calendarFeedService.ts',
  'src/services/studentProgressService.ts',
  'src/services/bookingPresetsService.ts',
  'src/services/dashboardService.ts',
  'src/services/tenantService.ts',
  'src/services/instructorLicenseNotificationService.ts',
  'src/utils/tenantTime.ts',
];

const REPO_ROOT = resolve(__dirname, '../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

// Per-file allowlisted line snippets - a forbidden-pattern match is only
// permitted on a line that contains one of these exact substrings.
const ALLOWLIST: Record<string, string[]> = {
  'src/services/schedulingService.ts': [
    // DATE-column dateKey extraction (no time component - UTC-midnight-safe).
    `row.date instanceof Date ? row.date.toISOString().split('T')[0]`,
  ],
  'src/services/lessonService.ts': [
    // DATE-column extraction for the update/merge path's existing-date read.
    `existing.date.toISOString().split('T')[0]`,
    `rawMergedDate.toISOString().split('T')[0]`,
    // DATE-column extraction for cancelLesson's fee-window check.
    `lesson.date.toISOString().split('T')[0]`,
    // Instant-vs-"now" comparisons for reminder scheduling - an instant has
    // no timezone, so comparing it against the real current moment is
    // legitimate regardless of tenant zone.
    `twentyFourHoursBefore > new Date()`,
    `oneHourBefore > new Date()`,
  ],
  'src/services/lessonInviteService.ts': [
    // DATE-column extraction.
    `lesson.lesson_date.toISOString().split('T')[0]`,
    // RFC 5545 DTSTAMP - a UTC creation instant, not a calendar-date derivation.
    'DTSTAMP:${toICSUtc(new Date())}',
  ],
  'src/services/calendarFeedService.ts': [
    // DATE-column extraction.
    `lesson.date.toISOString().split('T')[0]`,
    // RFC 5545 DTSTAMP.
    'DTSTAMP:${formatICSDate(new Date())}',
  ],
  'src/services/studentProgressService.ts': [
    // calculateAge's own default-reference parameter, same allowlisted
    // pattern as tenantTime.ts's/tenantService.ts's own primitives above -
    // lets a caller ask "how old was this person AS OF a past instant"
    // (e.g. certificate-worklist eligibility, gated by age at an
    // enrollment's completion date) without touching Date itself.
    `reference: Date = new Date()`,
  ],
  'src/services/bookingPresetsService.ts': [],
  'src/services/dashboardService.ts': [
    // DATE-column extraction for the review queue's end-time-passed check.
    `row.date.toISOString().split('T')[0]`,
    // Same DATE-column extraction, for instructor_license_expiration -
    // both are plain `date` columns with no time component, so this is
    // UTC-midnight-safe (see the identical reasoning in
    // getLessonsNeedingReview a few lines above).
    `? row.instructor_license_expiration.toISOString().split('T')[0]`,
    // Instant-vs-"now" comparison - an instant has no timezone, so
    // comparing a lesson's resolved end instant against the real current
    // moment is legitimate regardless of tenant zone.
    `const now = new Date();`,
  ],
  'src/services/tenantService.ts': [
    // getTenantNow's own default-reference parameter, same allowlisted
    // pattern as tenantTime.ts's own primitives below - this is the
    // function every consumer (including the frontend, via GET
    // /tenant/settings) calls instead of touching Date itself.
    `reference: Date = new Date()`,
  ],
  'src/services/instructorLicenseNotificationService.ts': [
    // Same DATE-column extraction reasoning as dashboardService.ts above -
    // instructor_license_expiration is a plain `date` column, no time
    // component, UTC-midnight-safe.
    `? row.instructor_license_expiration.toISOString().split('T')[0]`,
  ],
  'src/utils/tenantTime.ts': [
    // The module's own default-reference parameters - the ONE place real
    // "now" is legitimately read, so every other file can call these
    // functions without touching Date itself.
    `reference: Date = new Date()`,
  ],
};

const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: `toISOString().split('T'`, pattern: /toISOString\(\)\.split\('T'/g },
  { name: '.getFullYear()', pattern: /\.getFullYear\(\)/g },
  { name: '.getMonth()', pattern: /\.getMonth\(\)/g },
  { name: '.getDate()', pattern: /\.getDate\(\)/g },
  { name: '.getDay()', pattern: /\.getDay\(\)/g },
  { name: 'bare new Date()', pattern: /new Date\(\)/g },
];

describe('no server-local date derivation (Constraint B structural test)', () => {
  for (const file of TARGET_FILES) {
    it(`${file}: every forbidden-pattern match is on an allowlisted line`, () => {
      const source = readSource(file);
      const lines = source.split('\n');
      const allowlist = ALLOWLIST[file] ?? [];

      const violations: string[] = [];

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Skip comment lines (// line comments and /** */ JSDoc bodies) -
        // this test scans executable code for the forbidden patterns, not
        // prose that mentions them while documenting the rule itself.
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

      expect(violations, `${file} has non-allowlisted server-local date derivation:\n${violations.join('\n')}`).toEqual([]);
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

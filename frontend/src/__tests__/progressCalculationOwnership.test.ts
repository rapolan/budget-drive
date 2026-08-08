import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Constraint A: computeStudentProgress (backend/src/services/studentProgressService.ts)
// must remain the ONLY place progress math happens. No frontend file may
// recompute a percentage or derive a required-lesson count independently -
// every display surface must read progress.lessonsRequired/percentComplete
// as already-computed fields.
//
// This mirrors the technique used by backend/src/__tests__/guardianMatching.test.ts
// ("findGuardianCandidates never issues a write query" - spy on a mechanism,
// assert a forbidden pattern is absent), adapted to a static-source-text
// check instead of a query-mock spy, since computeStudentProgress is a pure
// function with no call mechanism to intercept.
//
// Uses import.meta.url + node:path instead of __dirname so this typechecks
// under the frontend's ESM tsconfig. Deliberately does NOT resolve a
// relative URL against import.meta.url (`new URL('.', import.meta.url)`) -
// Vitest's jsdom test environment shadows the global URL constructor, and
// resolving a relative URL through it silently rebases against jsdom's
// http://localhost page origin instead of the file:// module URL, which
// then fails fileURLToPath's scheme check. Converting the file URL to a
// path first, then using node:path's dirname, sidesteps that entirely.

const TARGET_FILES = [
  'src/components/students/StudentProgressBar.tsx',
  'src/components/students/StudentProgressCard.tsx',
  'src/pages/Students.tsx',
  'src/utils/turning18.ts',
];

const testDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(testDir, '../..', relativePath), 'utf8');
}

describe('progress calculation ownership (Constraint A)', () => {
  it('no frontend display file assigns percentComplete - it is only ever read', () => {
    for (const file of TARGET_FILES) {
      const source = readSource(file);
      expect(source, `${file} must not assign progress.percentComplete`).not.toMatch(/percentComplete\s*[:=]\s*[^,}]/);
    }
  });

  it('no frontend display file computes a required-lesson count with Math.ceil or a lessonsRequired assignment', () => {
    for (const file of TARGET_FILES) {
      const source = readSource(file);
      expect(source, `${file} must not call Math.ceil (that belongs only in computeStudentProgress)`).not.toMatch(/Math\.ceil\(/);
      expect(source, `${file} must not assign lessonsRequired - it may only be read from progress`).not.toMatch(/\blessonsRequired\s*[:=]\s*[^,}]/);
    }
  });

  it('StudentProgressBar and Students.tsx read lessonsCompleted/lessonsRequired/displayLabel from the progress payload, not local arithmetic on hoursCompleted or duration', () => {
    const bar = readSource('src/components/students/StudentProgressBar.tsx');
    expect(bar).toMatch(/progress\.lessonsCompleted/);
    expect(bar).toMatch(/progress\.lessonsRequired/);
    expect(bar).not.toMatch(/\.duration\b/);

    const studentsPage = readSource('src/pages/Students.tsx');
    expect(studentsPage).toMatch(/progress\?\.percentComplete/);
    // Students.tsx must not build its own lesson-count math from raw lesson arrays.
    expect(studentsPage).not.toMatch(/lessons\.filter\([^)]*status[^)]*completed[^)]*\)\.length/);
  });

  it('turning18.ts only reads hours fields already on the progress payload - it does not compute lessonsRequired or a percent', () => {
    const source = readSource('src/utils/turning18.ts');
    expect(source).toMatch(/progress\.hoursCompleted/);
    expect(source).toMatch(/progress\.hoursScheduled/);
    expect(source).toMatch(/progress\.hoursRequired/);
    expect(source).not.toMatch(/lessonsRequired/);
    expect(source).not.toMatch(/percentComplete\s*[:=]/);
  });

  it('both the table and card view in Students.tsx render progress through the same StudentProgressBar component', () => {
    const source = readSource('src/pages/Students.tsx');
    const occurrences = source.match(/<StudentProgressBar\s/g) ?? [];
    // One usage in the card block, one in the table block - proves Constraint
    // B (one shared component) is still wired both places, not just imported.
    expect(occurrences.length).toBe(2);
  });
});

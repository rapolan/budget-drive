import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudentProgressCard } from './StudentProgressCard';
import type { Student, StudentProgress } from '@/types';

afterEach(cleanup);

function makeStudent(progress: StudentProgress): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 999, // deliberately wrong/stale - must never be read for display
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    progress,
  } as Student;
}

// Regression coverage: StudentProgressCard previously computed its own
// hours/percentage math with a hardcoded || 40 fallback (inconsistent with
// every other || 6 fallback elsewhere in the app). It must now render only
// the backend-computed progress payload's displayLabel.
describe('StudentProgressCard', () => {
  it('renders the hours-track display label exactly, not a recomputed value', () => {
    render(
      <StudentProgressCard
        student={makeStudent({
          track: 'hours',
          hoursCompleted: 4.5,
          hoursRequired: 6,
          hoursScheduled: 0,
          displayLabel: '4.5 / 6 hrs',
          percentComplete: 75,
          needsDateOfBirth: false,
        })}
        lessons={[]}
      />
    );

    expect(screen.getByText('4.5 / 6 hrs')).toBeInTheDocument();
    // The stale totalHoursCompleted (999) must never leak into the display.
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  });

  it('renders "No lessons booked" for a zero-booked lessons-track student, never "0%"', () => {
    render(
      <StudentProgressCard
        student={makeStudent({
          track: 'lessons',
          lessonsCompleted: 0,
          lessonsBooked: 0,
          displayLabel: 'No lessons booked',
          percentComplete: 0,
          needsDateOfBirth: false,
        })}
        lessons={[]}
      />
    );

    expect(screen.getByText('No lessons booked')).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('hides the hours-based milestones section for a lessons-track student', () => {
    render(
      <StudentProgressCard
        student={makeStudent({
          track: 'lessons',
          lessonsCompleted: 2,
          lessonsBooked: 3,
          lessonsPercent: 67,
          displayLabel: '2 of 3 lessons (67%)',
          percentComplete: 67,
          needsDateOfBirth: false,
        })}
        lessons={[]}
      />
    );

    expect(screen.getByText('2 of 3 lessons (67%)')).toBeInTheDocument();
    expect(screen.queryByText('Milestones')).not.toBeInTheDocument();
  });

  it('shows the lesson count as the primary label and the hours figure in a separate caption for a minor', () => {
    render(
      <StudentProgressCard
        student={makeStudent({
          track: 'hours',
          hoursCompleted: 4.5,
          hoursRequired: 6,
          hoursScheduled: 0,
          lessonsCompleted: 3,
          lessonsRequired: 3,
          displayLabel: '4.5 / 6 hrs',
          percentComplete: 100,
          needsDateOfBirth: false,
        })}
        lessons={[]}
      />
    );

    expect(screen.getByText('3 / 3 lessons')).toBeInTheDocument();
    expect(screen.getByText('Required Hours')).toBeInTheDocument();
    expect(screen.getByText('4.5 / 6 hrs')).toBeInTheDocument();
    expect(screen.getByText(/California requires 6 behind-the-wheel hours/i)).toBeInTheDocument();
  });

  it('does not show the hours caption for an adult (lessons track)', () => {
    render(
      <StudentProgressCard
        student={makeStudent({
          track: 'lessons',
          lessonsCompleted: 2,
          lessonsBooked: 3,
          lessonsPercent: 67,
          displayLabel: '2 of 3 lessons (67%)',
          percentComplete: 67,
          needsDateOfBirth: false,
        })}
        lessons={[]}
      />
    );

    expect(screen.queryByText('Required Hours')).not.toBeInTheDocument();
  });

  it('shows an "add date of birth" prompt when needsDateOfBirth is true', () => {
    render(
      <StudentProgressCard
        student={makeStudent({
          track: 'hours',
          hoursCompleted: 0,
          hoursRequired: 6,
          hoursScheduled: 0,
          displayLabel: '0 / 6 hrs',
          percentComplete: 0,
          needsDateOfBirth: true,
        })}
        lessons={[]}
      />
    );

    expect(screen.getByText(/add a date of birth/i)).toBeInTheDocument();
  });
});

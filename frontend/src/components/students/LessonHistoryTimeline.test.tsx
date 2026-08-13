import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LessonHistoryTimeline } from './LessonHistoryTimeline';
import type { Lesson, Instructor } from '@/types';

afterEach(cleanup);

const INSTRUCTOR: Instructor = {
  id: 'instructor-1',
  tenantId: 'tenant-1',
  fullName: 'John Smith',
  email: 'john@example.com',
  phone: '555-1111',
} as Instructor;

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: 'vehicle-1',
    date: '2026-08-01',
    startTime: '14:00:00',
    endTime: '16:00:00',
    duration: 120,
    lessonType: 'behind_wheel',
    pickupAddress: '123 Main St, 90008',
    cost: 75,
    status: 'completed',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  } as Lesson;
}

// Dates chosen so sort order (most recent first) is unambiguous and
// distinct from array insertion order - a naive "keep the first 3" bug
// would fail these if the fixtures weren't already sorted. Each lesson's
// pickupAddress is a unique, human-readable marker ("Stop <date>") so
// tests can assert on WHICH lessons are visible without depending on
// formatShortDate's exact (locale/timezone-sensitive) output.
function lessonsWithDates(dates: string[]): Lesson[] {
  return dates.map((date, i) =>
    lesson({ id: `lesson-${i}`, date: date as unknown as Date, pickupAddress: `Stop ${date}` })
  );
}

describe('LessonHistoryTimeline - caps the list to the 3 most recent by default', () => {
  it('renders all lessons with no expander when there are 3 or fewer', () => {
    const lessons = lessonsWithDates(['2026-08-01', '2026-07-15', '2026-06-01']);
    render(<LessonHistoryTimeline lessons={lessons} instructors={[INSTRUCTOR]} />);

    expect(screen.getAllByText('John Smith')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('renders only the 3 most recent lessons by date when there are more than 3, regardless of array order', () => {
    // Deliberately out of date order - the component must sort, not just slice.
    const lessons = lessonsWithDates([
      '2026-01-01', // oldest
      '2026-08-01', // most recent
      '2026-03-01',
      '2026-06-01',
      '2026-05-01',
    ]);
    render(<LessonHistoryTimeline lessons={lessons} instructors={[INSTRUCTOR]} />);

    // The 3 most recent by date are visible...
    expect(screen.getByText('Stop 2026-08-01')).toBeInTheDocument();
    expect(screen.getByText('Stop 2026-06-01')).toBeInTheDocument();
    expect(screen.getByText('Stop 2026-05-01')).toBeInTheDocument();
    // ...and the 2 oldest are not - proving this sorts before slicing,
    // rather than just keeping the first 3 in array-insertion order.
    expect(screen.queryByText('Stop 2026-01-01')).not.toBeInTheDocument();
    expect(screen.queryByText('Stop 2026-03-01')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show all \(5\)/i })).toBeInTheDocument();
  });

  it('expands to show all lessons when "Show all (N)" is clicked, and collapses again on a second click', () => {
    const lessons = lessonsWithDates([
      '2026-08-01',
      '2026-07-01',
      '2026-06-01',
      '2026-05-01',
      '2026-04-01',
    ]);
    render(<LessonHistoryTimeline lessons={lessons} instructors={[INSTRUCTOR]} />);

    expect(screen.getAllByText('John Smith')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /show all \(5\)/i }));
    expect(screen.getAllByText('John Smith')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.getAllByText('John Smith')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /show all \(5\)/i })).toBeInTheDocument();
  });

  it('shows the empty state, not an expander, when there are zero lessons', () => {
    render(<LessonHistoryTimeline lessons={[]} instructors={[INSTRUCTOR]} />);

    expect(screen.getByText('No lessons scheduled yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });
});

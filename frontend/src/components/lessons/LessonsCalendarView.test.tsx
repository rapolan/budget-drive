import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LessonsCalendarView } from './LessonsCalendarView';
import type { Lesson, Instructor } from '@/types';

// Regression: the Lessons calendar (monthly) view had no instructor
// filter at all, always showing every instructor's lessons/availability
// mixed together - unlike the weekly view, which already lets an admin
// pick one instructor. Adds the same filter here, persisted via
// useSessionState under 'lessons-calendar-instructor-filter'.

const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-15',
  tomorrow: '2026-03-16',
  currentTime: '12:00',
  weekStart: '2026-03-15',
  weekEnd: '2026-03-21',
  monthBoundaries: { start: '2026-03-01', end: '2026-03-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantNow: TENANT_NOW }),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function instructor(id: string, fullName: string): Instructor {
  return {
    id,
    tenantId: 'tenant-1',
    fullName,
    email: `${id}@example.com`,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as Instructor;
}

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: null,
    date: TENANT_NOW.today as unknown as Date,
    startTime: '10:00:00',
    endTime: '12:00:00',
    duration: 120,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 150,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
}

const INSTRUCTORS = [instructor('instructor-1', 'Alice Anderson'), instructor('instructor-2', 'Bob Baker')];

function renderCalendar(lessons: Lesson[]) {
  return render(
    <LessonsCalendarView
      lessons={lessons}
      availability={[]}
      instructors={INSTRUCTORS}
      onLessonClick={vi.fn()}
      getStudentName={() => 'Test Student'}
      getInstructorName={(id) => INSTRUCTORS.find((i) => i.id === id)?.fullName ?? 'Unknown'}
    />
  );
}

describe('LessonsCalendarView - instructor filter', () => {
  it('shows lessons from every instructor when "All Instructors" is selected (the default)', () => {
    renderCalendar([
      lesson({ id: 'l1', instructorId: 'instructor-1' }),
      lesson({ id: 'l2', instructorId: 'instructor-2' }),
    ]);

    const statValue = screen.getByText('Lessons This Month').previousElementSibling;
    expect(statValue?.textContent).toBe('2');
  });

  it("filters to only the selected instructor's lessons when a specific instructor is picked", () => {
    renderCalendar([
      lesson({ id: 'l1', instructorId: 'instructor-1' }),
      lesson({ id: 'l2', instructorId: 'instructor-2' }),
    ]);

    fireEvent.click(screen.getByTitle('Alice Anderson'));

    const statValue = screen.getByText('Lessons This Month').previousElementSibling;
    expect(statValue?.textContent).toBe('1');
  });

  it('persists the selected instructor across remounts via sessionStorage', () => {
    const { unmount } = renderCalendar([
      lesson({ id: 'l1', instructorId: 'instructor-1' }),
      lesson({ id: 'l2', instructorId: 'instructor-2' }),
    ]);

    fireEvent.click(screen.getByTitle('Bob Baker'));
    expect(window.sessionStorage.getItem('lessons-calendar-instructor-filter')).toBe('instructor-2');

    unmount();

    renderCalendar([
      lesson({ id: 'l1', instructorId: 'instructor-1' }),
      lesson({ id: 'l2', instructorId: 'instructor-2' }),
    ]);

    // Still filtered to instructor-2 (Bob) after remount, not reset to All.
    const statValue = screen.getByText('Lessons This Month').previousElementSibling;
    expect(statValue?.textContent).toBe('1');
  });

  it('switching back to "All Instructors" clears the filter', () => {
    renderCalendar([
      lesson({ id: 'l1', instructorId: 'instructor-1' }),
      lesson({ id: 'l2', instructorId: 'instructor-2' }),
    ]);

    fireEvent.click(screen.getByTitle('Alice Anderson'));
    fireEvent.click(screen.getByRole('button', { name: /all instructors/i }));

    const statValue = screen.getByText('Lessons This Month').previousElementSibling;
    expect(statValue?.textContent).toBe('2');
  });
});

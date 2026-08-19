import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LessonsCalendarView } from './LessonsCalendarView';
import type { Lesson } from '@/types';

// See Dashboard.hostileClock.test.tsx for the axis-separation rationale.

const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-01', // a Sunday
  tomorrow: '2026-03-02',
  currentTime: '12:00',
  weekStart: '2026-02-22',
  weekEnd: '2026-02-28',
  monthBoundaries: { start: '2026-03-01', end: '2026-03-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantNow: TENANT_NOW }),
}));

afterEach(cleanup);

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

function renderCalendar(lessons: Lesson[] = []) {
  return render(
    <LessonsCalendarView
      lessons={lessons}
      availability={[]}
      instructors={[]}
      onLessonClick={vi.fn()}
      getStudentName={() => 'Test Student'}
      getInstructorName={() => 'Test Instructor'}
    />
  );
}

describe('LessonsCalendarView - hostile clock (tenant America/Los_Angeles, browser America/New_York)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it("initially displays the tenant's today's month/year in the header, not the browser's", () => {
    renderCalendar();
    // TENANT_NOW.today is 2026-03-01 - the header should read "March 2026"
    // regardless of what month the browser's own clock would report.
    expect(screen.getByText('March 2026')).toBeInTheDocument();
  });

  it("highlights the calendar cell matching the tenant's today, not the browser's", () => {
    renderCalendar();
    // The today cell's day number gets a distinct filled-circle style
    // (bg-primary text-white) - day "1" (2026-03-01, the tenant's today)
    // should carry it; other "1"s in the grid (adjacent months) should not.
    const dayCells = screen.getAllByText('1');
    const highlighted = dayCells.some((el) => el.className.includes('bg-primary') && el.className.includes('text-white'));
    expect(highlighted).toBe(true);
  });

  it('counts a lesson dated the tenant\'s today toward this month\'s stats, even though the browser would place "today" in a different month near a month boundary', () => {
    const { container } = renderCalendar([
      lesson({ id: 'today-lesson', date: TENANT_NOW.today as unknown as Date, status: 'scheduled' }),
    ]);
    // "Lessons This Month" stat tile shows the count.
    expect(container.textContent).toContain('Lessons This Month');
    // The lesson should be counted (monthlyStats.totalLessons === 1).
    const statValue = screen.getByText('Lessons This Month').previousElementSibling;
    expect(statValue?.textContent).toBe('1');
  });
});

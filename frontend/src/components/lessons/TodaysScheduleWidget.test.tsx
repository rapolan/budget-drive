import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TodaysScheduleWidget } from './TodaysScheduleWidget';
import type { Lesson } from '@/types';

const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-08-25',
  tomorrow: '2026-08-26',
  currentTime: '10:00',
  weekStart: '2026-08-23',
  weekEnd: '2026-08-29',
  monthBoundaries: { start: '2026-08-01', end: '2026-08-31' },
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
    startTime: '11:00',
    endTime: '13:00',
    duration: 120,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 150,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
}

const noop = () => {};
const noopStr = (_id: string) => {};

describe('TodaysScheduleWidget - completion bar denominator (item 8 regression)', () => {
  it('excludes cancelled/no_show lessons from the denominator - 2 actionable of 3 total shows 0/2, not 0/3', () => {
    render(
      <TodaysScheduleWidget
        lessons={[
          lesson({ id: 'l1', status: 'scheduled' }),
          lesson({ id: 'l2', status: 'scheduled' }),
          lesson({ id: 'l3', status: 'no_show' }),
        ]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={() => 'Test Student'}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    expect(screen.getByText('0/2 complete')).toBeInTheDocument();
  });

  it('the denominator also excludes cancelled lessons', () => {
    render(
      <TodaysScheduleWidget
        lessons={[
          lesson({ id: 'l1', status: 'completed' }),
          lesson({ id: 'l2', status: 'cancelled' }),
        ]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={() => 'Test Student'}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    expect(screen.getByText('1/1 complete')).toBeInTheDocument();
  });

  it('shows "All done!" once every actionable (non-cancelled/no-show) lesson is completed, even with a cancelled lesson present', () => {
    render(
      <TodaysScheduleWidget
        lessons={[
          lesson({ id: 'l1', status: 'completed' }),
          lesson({ id: 'l2', status: 'completed' }),
          lesson({ id: 'l3', status: 'cancelled' }),
        ]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={() => 'Test Student'}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    expect(screen.getByText('2/2 complete')).toBeInTheDocument();
    expect(screen.getByText(/all done/i)).toBeInTheDocument();
  });

  it('still counts a normal all-scheduled day correctly (no regression on the common case)', () => {
    render(
      <TodaysScheduleWidget
        lessons={[
          lesson({ id: 'l1', status: 'completed' }),
          lesson({ id: 'l2', status: 'scheduled' }),
          lesson({ id: 'l3', status: 'scheduled' }),
        ]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={() => 'Test Student'}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    expect(screen.getByText('1/3 complete')).toBeInTheDocument();
  });
});

describe('TodaysScheduleWidget - Now vs Upcoming (item 9 regression: two lessons at the same start time)', () => {
  // tenantNow.currentTime is '10:00' (mocked above) - both lessons below
  // start at 09:00 and end at 11:00, so both are genuinely in progress
  // right now.
  const gigi = lesson({ id: 'in-progress-1', startTime: '09:00', endTime: '11:00', studentId: 'gigi' });
  const owen = lesson({ id: 'in-progress-2', startTime: '09:00', endTime: '11:00', studentId: 'owen' });

  function getStudentName(id: string) {
    return id === 'gigi' ? 'Gigi Polan' : id === 'owen' ? 'Owen Castillo' : 'Unknown';
  }

  it('classifies BOTH same-start-time in-progress lessons as "Now", not just the first', () => {
    render(
      <TodaysScheduleWidget
        lessons={[gigi, owen]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={getStudentName}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    // Both students appear under a "Now" treatment - the regression this
    // guards against is Owen falling through to plain "Upcoming" with no
    // in-progress indicator while Gigi correctly showed "Now".
    const nowLabels = screen.getAllByText('Now');
    expect(nowLabels.length).toBe(2);
    expect(screen.getByText('Gigi Polan')).toBeInTheDocument();
    expect(screen.getByText('Owen Castillo')).toBeInTheDocument();
  });

  it('neither same-start-time in-progress lesson is rendered inside the "Upcoming" list itself', () => {
    render(
      <TodaysScheduleWidget
        lessons={[gigi, owen]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={getStudentName}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    // Both students already appear once (in the "Now" cards asserted
    // above) - the regression this guards is either name appearing a
    // SECOND time in the Upcoming list beneath, which is what would
    // happen if the currentLessonIds exclusion filter missed one of them.
    expect(screen.getAllByText('Gigi Polan')).toHaveLength(1);
    expect(screen.getAllByText('Owen Castillo')).toHaveLength(1);
  });
});

describe('TodaysScheduleWidget - "Upcoming" header hidden when empty (item 2 regression)', () => {
  it('does not render the "Upcoming" header when every scheduled lesson is already shown as Now or Next', () => {
    // Both lessons start at the same time as tenantNow.currentTime
    // ('10:00'), so both are classified "Now" and consumed by that
    // section above - nothing is left for the plain Upcoming list, but
    // scheduledLessons.length is still 2 (> 0), which previously gated
    // the header on its own and rendered it with nothing beneath it.
    const a = lesson({ id: 'now-1', startTime: '09:00', endTime: '11:00', studentId: 'a' });
    const b = lesson({ id: 'now-2', startTime: '09:00', endTime: '11:00', studentId: 'b' });

    render(
      <TodaysScheduleWidget
        lessons={[a, b]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={() => 'Test Student'}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    expect(screen.queryByText(/^upcoming$/i)).not.toBeInTheDocument();
  });

  it('still renders the "Upcoming" header when a lesson genuinely remains after Now/Next', () => {
    // `now` is classified "Now"; of the two remaining scheduled lessons,
    // the earlier (`next`) is consumed by its own "Next" card, leaving
    // `later` as the one genuine entry in the plain Upcoming list.
    const now = lesson({ id: 'now-1', startTime: '09:00', endTime: '11:00', studentId: 'now-student' });
    const next = lesson({ id: 'next-1', startTime: '14:00', endTime: '15:00', studentId: 'next-student' });
    const later = lesson({ id: 'later-1', startTime: '16:00', endTime: '17:00', studentId: 'later-student' });

    render(
      <TodaysScheduleWidget
        lessons={[now, next, later]}
        onViewLesson={noop}
        onCompleteLesson={noopStr}
        getStudentName={() => 'Test Student'}
        getInstructorName={() => 'Test Instructor'}
      />
    );

    expect(screen.getByText(/^upcoming$/i)).toBeInTheDocument();
  });
});

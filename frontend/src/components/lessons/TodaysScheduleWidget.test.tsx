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

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudentProgressBar } from './StudentProgressBar';
import type { StudentProgress } from '@/types';

afterEach(cleanup);

function progress(overrides: Partial<StudentProgress> = {}): StudentProgress {
  return {
    track: 'hours',
    displayLabel: '',
    percentComplete: 0,
    needsDateOfBirth: false,
    ...overrides,
  };
}

describe('StudentProgressBar', () => {
  it('renders "X / Y lessons" and the percent for a mid-progress minor', () => {
    render(
      <StudentProgressBar
        progress={progress({ track: 'hours', lessonsCompleted: 3, lessonsRequired: 6, percentComplete: 50 })}
      />
    );
    expect(screen.getByText('3 / 6 lessons')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders "No lessons booked" with no percent and a zero-width bar for an adult with zero bookings', () => {
    const { container } = render(
      <StudentProgressBar
        progress={progress({ track: 'lessons', lessonsCompleted: 0, lessonsRequired: 0, percentComplete: 0 })}
      />
    );
    expect(screen.getByText('No lessons booked')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar.style.width).toBe('0%');
  });

  it('renders "Completed" with 100% for the completed track', () => {
    render(<StudentProgressBar progress={progress({ track: 'completed', displayLabel: 'Completed', percentComplete: 100 })} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('uses the primary color (not amber) at low progress', () => {
    const { container } = render(
      <StudentProgressBar
        progress={progress({ track: 'lessons', lessonsCompleted: 1, lessonsRequired: 5, percentComplete: 20 })}
      />
    );
    const bar = container.querySelector('.bg-primary');
    expect(bar).toBeInTheDocument();
    expect(container.querySelector('.bg-status-warning-text')).not.toBeInTheDocument();
  });

  it('uses the success color only at 100%', () => {
    const { container } = render(
      <StudentProgressBar
        progress={progress({ track: 'lessons', lessonsCompleted: 5, lessonsRequired: 5, percentComplete: 100 })}
      />
    );
    expect(container.querySelector('.bg-status-success-text')).toBeInTheDocument();
    expect(container.querySelector('.bg-primary')).not.toBeInTheDocument();
  });

  it('never renders a raw decimal in the label', () => {
    render(
      <StudentProgressBar
        progress={progress({ track: 'hours', lessonsCompleted: 2, lessonsRequired: 3, percentComplete: 67 })}
      />
    );
    expect(screen.queryByText(/\d+\.\d+/)).not.toBeInTheDocument();
  });

  it('renders identical output for identical props regardless of caller (Constraint B)', () => {
    const p = progress({ track: 'hours', lessonsCompleted: 2, lessonsRequired: 4, percentComplete: 50 });
    const first = render(<StudentProgressBar progress={p} />);
    const firstHtml = first.container.innerHTML;
    cleanup();
    const second = render(<StudentProgressBar progress={p} />);
    expect(second.container.innerHTML).toBe(firstHtml);
  });

  it('renders a dash when progress is undefined', () => {
    render(<StudentProgressBar progress={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

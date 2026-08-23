import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudentStatusBadge } from './StudentStatusBadge';
import type { StatusInfo } from '@/utils/studentStatus';

afterEach(cleanup);

function statusInfo(overrides: Partial<StatusInfo> = {}): StatusInfo {
  return {
    status: 'ready_to_book',
    displayStatus: 'Ready to Book',
    ...overrides,
  };
}

describe('StudentStatusBadge', () => {
  it('renders "Scheduled (N)" with blue/info tokens for a scheduled student', () => {
    const { container } = render(
      <StudentStatusBadge
        statusInfo={statusInfo({ status: 'scheduled', displayStatus: 'Scheduled (3)', upcomingLessonCount: 3 })}
        readyToComplete={false}
      />
    );
    expect(screen.getByText('Scheduled (3)')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-info-bg')).toBeInTheDocument();
  });

  it('renders "Ready to Book" with green/success tokens, not amber', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'ready_to_book', displayStatus: 'Ready to Book' })} readyToComplete={false} />
    );
    expect(screen.getByText('Ready to Book')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-success-bg')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-warning-bg')).not.toBeInTheDocument();
  });

  it('renders needs_attention with amber/warning tokens', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'needs_attention', displayStatus: 'Needs Attention' })} readyToComplete={false} />
    );
    expect(container.querySelector('.bg-status-warning-bg')).toBeInTheDocument();
  });

  it('renders "Completed" with neutral gray tokens', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'completed', displayStatus: 'Completed' })} readyToComplete={false} />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface3')).toBeInTheDocument();
  });

  it('renders "Dropped" (withdrawn) with muted gray tokens', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'inactive', displayStatus: 'Dropped' })} readyToComplete={false} />
    );
    expect(screen.getByText('Dropped')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface2')).toBeInTheDocument();
  });

  it('renders "Suspended" with terracotta tokens, distinct from danger red', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'inactive', displayStatus: 'Suspended' })} readyToComplete={false} />
    );
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-terracotta-bg')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-danger-bg')).not.toBeInTheDocument();
  });

  it('overrides the base status with the gold "Ready to Complete" treatment and a star icon when readyToComplete is true', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'scheduled', displayStatus: 'Scheduled (1)' })} readyToComplete={true} />
    );
    expect(screen.getByText('Ready to Complete')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled (1)')).not.toBeInTheDocument();
    expect(container.querySelector('.bg-gold-bg')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('never wraps the label onto two lines (whitespace-nowrap, uniform padding/height)', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'ready_to_book', displayStatus: 'Ready to Book' })} readyToComplete={false} />
    );
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('whitespace-nowrap');
    expect(badge?.className).toContain('px-2.5');
    expect(badge?.className).toContain('py-1');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudentStatusBadge } from './StudentStatusBadge';
import type { StatusInfo, DeStatusInfo, DisplayStatus } from '@/utils/studentStatus';

afterEach(cleanup);

function statusInfo(overrides: Partial<StatusInfo> = {}): StatusInfo {
  return {
    status: 'ready_to_book',
    displayStatus: 'Ready to Book',
    ...overrides,
  };
}

describe('StudentStatusBadge', () => {
  // Color swap: scheduled is now green/success ("on track, all set"),
  // ready_to_book is now blue/info ("neutral, between lessons") - reversed
  // from the original assignment.
  it('renders "Scheduled (N)" with green/success tokens for a scheduled student', () => {
    const { container } = render(
      <StudentStatusBadge
        statusInfo={statusInfo({ status: 'scheduled', displayStatus: 'Scheduled (3)', upcomingLessonCount: 3 })}
        readyToComplete={false}
      />
    );
    expect(screen.getByText('Scheduled (3)')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-success-bg')).toBeInTheDocument();
  });

  it('renders "Ready to Book" with blue/info tokens, not amber', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={statusInfo({ status: 'ready_to_book', displayStatus: 'Ready to Book' })} readyToComplete={false} />
    );
    expect(screen.getByText('Ready to Book')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-info-bg')).toBeInTheDocument();
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

// The discriminated union getDisplayStatus returns - the DE variant has no
// "needs attention" urgency concept, just complete (green) vs in-progress
// (neutral blue/info) vs no enrollment (muted gray).
describe('StudentStatusBadge - DisplayStatus (DE) variant', () => {
  function deStatus(overrides: Partial<DeStatusInfo> = {}): DisplayStatus {
    return {
      kind: 'de',
      info: {
        status: 'enrolled',
        displayStatus: '2/4 days attended',
        ...overrides,
      },
    };
  }

  it('renders an in-progress DE status with neutral blue/info tokens', () => {
    const { container } = render(
      <StudentStatusBadge statusInfo={deStatus()} readyToComplete={false} />
    );
    expect(screen.getByText('2/4 days attended')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-info-bg')).toBeInTheDocument();
  });

  it('renders a completed DE status with green/success tokens', () => {
    const { container } = render(
      <StudentStatusBadge
        statusInfo={deStatus({ status: 'completed', displayStatus: 'DE Completed' })}
        readyToComplete={false}
      />
    );
    expect(screen.getByText('DE Completed')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-success-bg')).toBeInTheDocument();
  });

  it('renders no_enrollment with muted gray tokens, not amber', () => {
    const { container } = render(
      <StudentStatusBadge
        statusInfo={deStatus({ status: 'no_enrollment', displayStatus: 'No DE Enrollment' })}
        readyToComplete={false}
      />
    );
    expect(screen.getByText('No DE Enrollment')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface2')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-warning-bg')).not.toBeInTheDocument();
  });

  it('renders the BTW variant of DisplayStatus identically to a plain StatusInfo', () => {
    const union: DisplayStatus = { kind: 'btw', info: statusInfo({ status: 'scheduled', displayStatus: 'Scheduled (2)' }) };
    const { container } = render(
      <StudentStatusBadge statusInfo={union} readyToComplete={false} />
    );
    expect(screen.getByText('Scheduled (2)')).toBeInTheDocument();
    expect(container.querySelector('.bg-status-success-bg')).toBeInTheDocument();
  });

  it('readyToComplete still overrides a DE union with the gold treatment', () => {
    render(<StudentStatusBadge statusInfo={deStatus()} readyToComplete={true} />);
    expect(screen.getByText('Ready to Complete')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditColumn } from './AuditColumn';

// Hostile-clock setup mirrors Lessons.hostileClock.test.tsx: tenant is
// America/Los_Angeles, the test process pretends to run in
// America/New_York, so any absolute time that leaked browser-local
// derivation instead of tenant-zone resolution would show the wrong hour.
const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-01',
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

describe('AuditColumn', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('shows a single "Created by" inline line when never edited', () => {
    render(
      <AuditColumn
        createdByName="System Admin"
        updatedByName="System Admin"
        createdAt={new Date('2026-02-20T18:00:00.000Z')}
        updatedAt={new Date('2026-02-20T18:00:00.000Z')}
      />
    );

    expect(screen.getByText(/^Created by System Admin ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^Edited by/)).not.toBeInTheDocument();
  });

  it('shows a single "Edited by" inline line (not two lines) when updated meaningfully after created', () => {
    render(
      <AuditColumn
        createdByName="System Admin"
        updatedByName="Jane Staff"
        createdAt={new Date('2026-02-18T18:00:00.000Z')}
        updatedAt={new Date('2026-02-20T18:00:00.000Z')}
      />
    );

    // The inline trigger line reads "Edited by", never "Created by" - the
    // tooltip's own "Created by ..." text is always present in the DOM
    // (opacity-driven reveal, not conditional rendering), so this checks
    // the inline trigger specifically rather than absence anywhere in the
    // document.
    expect(screen.getByText(/^Edited by Jane Staff ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^Created by System Admin ·/)).not.toBeInTheDocument();
  });

  it('treats a sub-1s gap as never-edited (existing tolerance preserved)', () => {
    const created = new Date('2026-02-20T18:00:00.000Z');
    const updated = new Date(created.getTime() + 500);
    render(
      <AuditColumn
        createdByName="System Admin"
        updatedByName="System Admin"
        createdAt={created}
        updatedAt={updated}
      />
    );

    expect(screen.getByText(/^Created by System Admin ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^Edited by/)).not.toBeInTheDocument();
  });

  it('reveals the full trail in a tooltip on hover, with absolute tenant-zone (not browser-local) times', async () => {
    const user = userEvent.setup();
    render(
      <AuditColumn
        createdByName="System Admin"
        updatedByName="Jane Staff"
        // 18:00 UTC = 10:00 AM Pacific (tenant) but 1:00 PM Eastern (fake browser TZ)
        createdAt={new Date('2026-02-18T18:00:00.000Z')}
        updatedAt={new Date('2026-02-20T18:00:00.000Z')}
      />
    );

    const trigger = screen.getByText(/^Edited by Jane Staff ·/);
    await user.hover(trigger);

    expect(screen.getByText(/Created by System Admin/)).toBeInTheDocument();
    expect(screen.getByText(/Last edited by Jane Staff/)).toBeInTheDocument();
    // Tenant zone (Pacific) reads 10:00 AM for both timestamps; browser-
    // local (Eastern) would have read 1:00 PM - asserting the Pacific hour
    // catches a regression back to browser-local derivation.
    expect(screen.getAllByText(/10:00\s?AM/)).toHaveLength(2);
    expect(screen.queryByText(/1:00\s?PM/)).not.toBeInTheDocument();
  });

  it('the tooltip is reachable and revealed by keyboard focus, not hover-only', async () => {
    const user = userEvent.setup();
    render(
      <AuditColumn
        createdByName="System Admin"
        updatedByName="System Admin"
        createdAt={new Date('2026-02-20T18:00:00.000Z')}
        updatedAt={new Date('2026-02-20T18:00:00.000Z')}
      />
    );

    const trigger = screen.getByText(/^Created by System Admin ·/);
    await user.tab();
    expect(trigger).toHaveFocus();

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent(/Created by System Admin/);
  });

  it('falls back to "Unknown" for a null name, same as before', () => {
    render(
      <AuditColumn
        createdByName={null}
        updatedByName={null}
        createdAt={new Date('2026-02-20T18:00:00.000Z')}
        updatedAt={new Date('2026-02-20T18:00:00.000Z')}
      />
    );

    expect(screen.getByText(/^Created by Unknown ·/)).toBeInTheDocument();
  });
});

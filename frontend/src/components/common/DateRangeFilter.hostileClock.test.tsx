import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangeFilter, type DateRangeValue } from './DateRangeFilter';

// Hostile-clock regression suite for DateRangeFilter. See
// Dashboard.hostileClock.test.tsx for the axis-separation rationale. This
// component takes tenant boundaries as props and never touches new Date()
// or date-fns's browser-clock helpers internally (see
// docs/ARCHITECTURE.md §7) - so the presets should match the injected
// props exactly regardless of the browser's own zone.

afterEach(cleanup);

const TENANT_BOUNDARIES = {
  tenantToday: '2026-03-01',
  tenantWeekStart: '2026-02-22',
  tenantWeekEnd: '2026-02-28',
  tenantMonthStart: '2026-03-01',
  tenantMonthEnd: '2026-03-31',
};

function renderFilter(onChange: (range: DateRangeValue) => void) {
  return render(
    <DateRangeFilter
      value={{ start: '', end: '', preset: 'all' }}
      onChange={onChange}
      {...TENANT_BOUNDARIES}
    />
  );
}

describe('DateRangeFilter - hostile clock (browser America/New_York)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('"Today" preset emits the injected tenantToday, not a browser-computed today', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter(onChange);

    await user.click(screen.getByRole('button', { name: 'Today' }));

    expect(onChange).toHaveBeenCalledWith({
      start: TENANT_BOUNDARIES.tenantToday,
      end: TENANT_BOUNDARIES.tenantToday,
      preset: 'today',
    });
  });

  it('"This Week" preset emits the injected tenantWeekStart/tenantWeekEnd, not a browser-computed week', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter(onChange);

    await user.click(screen.getByRole('button', { name: 'This Week' }));

    expect(onChange).toHaveBeenCalledWith({
      start: TENANT_BOUNDARIES.tenantWeekStart,
      end: TENANT_BOUNDARIES.tenantWeekEnd,
      preset: 'this_week',
    });
  });

  it('"This Month" preset emits the injected tenantMonthStart/tenantMonthEnd, not a browser-computed month', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter(onChange);

    await user.click(screen.getByRole('button', { name: 'This Month' }));

    expect(onChange).toHaveBeenCalledWith({
      start: TENANT_BOUNDARIES.tenantMonthStart,
      end: TENANT_BOUNDARIES.tenantMonthEnd,
      preset: 'this_month',
    });
  });
});

describe('DateRangeFilter - hostile clock, reversed (browser America/Los_Angeles)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('"Today" preset still emits the injected tenantToday when the browser is on the opposite coast', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter(onChange);

    await user.click(screen.getByRole('button', { name: 'Today' }));

    expect(onChange).toHaveBeenCalledWith({
      start: TENANT_BOUNDARIES.tenantToday,
      end: TENANT_BOUNDARIES.tenantToday,
      preset: 'today',
    });
  });
});

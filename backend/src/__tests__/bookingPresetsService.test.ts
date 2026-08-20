import { describe, it, expect, vi } from 'vitest';
import { tenantToday, tenantMonthBoundaries } from '../utils/tenantTime';

const mockResolveTimezone = vi.fn();
vi.mock('../services/schedulingService', () => ({
  resolveTimezone: (...args: unknown[]) => mockResolveTimezone(...args),
}));

import { getDatePresets } from '../services/bookingPresetsService';

// Regression: "This Month" used to be tenantMonthBoundaries(timezone)
// directly - start of calendar month through end of calendar month - which
// includes every day already past whenever today isn't the 1st. As a
// booking-wizard date-range preset (not a reporting window), that's wrong:
// it must never let an admin pick a past date. Fixed to start from the
// tenant's own today (Constraint: resolved via tenantTime.ts, never
// server/browser local time) and keep the calendar month's own last day
// as the end.
describe('getDatePresets - "This Month" preset', () => {
  it('starts at the tenant\'s today, not the 1st of the month, when today is mid-month', async () => {
    mockResolveTimezone.mockResolvedValue('America/Los_Angeles');

    const presets = await getDatePresets('tenant-1');

    const expectedToday = tenantToday('America/Los_Angeles');
    const expectedMonthEnd = tenantMonthBoundaries('America/Los_Angeles').end;

    expect(presets.thisMonth.start).toBe(expectedToday);
    expect(presets.thisMonth.end).toBe(expectedMonthEnd);
    // The regression itself: start must never be the 1st unless today
    // genuinely is the 1st - asserted structurally rather than pinned to a
    // specific calendar date so this test stays valid on any run date.
    if (!expectedToday.endsWith('-01')) {
      expect(presets.thisMonth.start).not.toBe(tenantMonthBoundaries('America/Los_Angeles').start);
    }
  });

  it('never returns a "This Month" start date before today', async () => {
    mockResolveTimezone.mockResolvedValue('America/New_York');

    const presets = await getDatePresets('tenant-1');
    const today = tenantToday('America/New_York');

    expect(presets.thisMonth.start >= today).toBe(true);
  });

  it("resolves the tenant's configured timezone, never a hardcoded or server-local one", async () => {
    mockResolveTimezone.mockResolvedValue('Asia/Tokyo');

    const presets = await getDatePresets('tenant-1');

    expect(presets.thisMonth.start).toBe(tenantToday('Asia/Tokyo'));
    expect(mockResolveTimezone).toHaveBeenCalledWith('tenant-1');
  });
});

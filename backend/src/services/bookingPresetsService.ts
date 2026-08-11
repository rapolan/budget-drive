/**
 * Booking Presets Service
 *
 * Serves the date-range preset boundaries the booking wizard's setup step
 * shows as chips ("Next 2 Weeks" / "This Month" / "Next Month"). Every
 * boundary is computed here, server-side, via backend/src/utils/tenantTime.ts
 * only - the frontend never derives a date boundary itself (Constraint B).
 */

import { resolveTimezone } from './schedulingService';
import {
  tenantTomorrow,
  addTenantDays,
  tenantMonthBoundaries,
  tenantNextMonthBoundaries,
} from '../utils/tenantTime';

export interface DateRangeBoundary {
  start: string;
  end: string;
}

export interface DatePresets {
  next2Weeks: DateRangeBoundary;
  thisMonth: DateRangeBoundary;
  nextMonth: DateRangeBoundary;
}

export const getDatePresets = async (tenantId: string): Promise<DatePresets> => {
  const timezone = await resolveTimezone(tenantId);

  const next2WeeksStart = tenantTomorrow(timezone);
  const next2WeeksEnd = addTenantDays(next2WeeksStart, 13, timezone);

  return {
    next2Weeks: { start: next2WeeksStart, end: next2WeeksEnd },
    thisMonth: tenantMonthBoundaries(timezone),
    nextMonth: tenantNextMonthBoundaries(timezone),
  };
};

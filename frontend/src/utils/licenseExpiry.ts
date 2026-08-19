/**
 * Instructor Driving School Instructor License Expiry Status
 *
 * Pure string comparison on already-tenant-resolved date strings - never
 * derives "today" itself. `tenantToday` must always be the already-resolved
 * `tenantNow.today` string from `useTenant()`, exactly like every other
 * frontend date comparison in this codebase (see CLAUDE.md's tenant-
 * timezone rule and docs/ARCHITECTURE.md §7). This is the same safe
 * category as `timeFormat.ts`'s helpers and `turning18.ts`'s predicate -
 * inputs already resolved server-side, compared here, "now" never derived.
 */

import { daysBetween } from './timeFormat';

export type LicenseStatus = 'missing' | 'expired' | 'expiring' | 'valid';

// Matches the Dashboard alert's own danger cutoff (dashboardService.ts's
// LICENSE_DANGER_WINDOW_DAYS) - keep both in sync if either changes.
const EXPIRING_WINDOW_DAYS = 30;

export function computeLicenseStatus(
  expirationDate: string | null | undefined,
  tenantToday: string
): LicenseStatus {
  if (!expirationDate) return 'missing';
  if (expirationDate < tenantToday) return 'expired';

  const daysUntilExpiry = daysBetween(tenantToday, expirationDate);
  if (daysUntilExpiry <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'valid';
}

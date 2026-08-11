/**
 * Tenant Timezone Helper Module
 *
 * The single place tenant-timezone date math happens (Constraint C - see
 * docs/ARCHITECTURE.md). No other backend file should reimplement offset/DST
 * logic, and none of this should be ported into the frontend.
 *
 * Why a library instead of hand-rolled offset math: DST transition dates
 * and rules vary by zone and change over time (countries periodically amend
 * their own DST laws). date-fns-tz reads the IANA tzdata bundled with Node's
 * own ICU build, which is the same source of truth browsers and OSes use -
 * hand-rolling this would mean re-deriving and maintaining that data
 * ourselves. date-fns-tz was chosen (over Luxon) because the frontend
 * already depends on date-fns for its own formatting - same underlying
 * library family. Frontend code must never import date-fns-tz or perform
 * timezone conversion itself; it only ever receives already-tenant-correct
 * strings/values.
 *
 * Storage is unchanged (Constraint A): `lessons.date`/`start_time`/
 * `end_time` and every other wall-clock column remain plain
 * `timestamp without time zone`/`date`/`time` values. This module changes
 * INTERPRETATION - which timezone a wall-clock value or a "today" means -
 * never how anything is stored.
 *
 * Pattern used throughout: `toZonedTime(utcInstant, timezone)` produces a
 * `Date` whose UTC-getter fields equal the tenant's wall-clock fields (a
 * "faked UTC" representation). date-fns's plain, timezone-naive functions
 * (`format`, `addDays`, `startOfMonth`, `endOfMonth`, `getDay`) are then
 * safe to apply directly to that representation, because they always read
 * UTC-equivalent getters when fed a Date this way - this holds regardless
 * of the PROCESS's own local timezone (verified against a non-UTC process
 * TZ during development), which matters because tests may run under a
 * different process TZ than production's TZ=UTC (see item 7). Never mix
 * this representation with `formatInTimeZone` (that would double-convert)
 * or with the Date's own local getters (`.getFullYear()` etc. - those read
 * the PROCESS's local time, not the tenant's, and are exactly the pattern
 * this module exists to replace).
 */

import { addDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Documented fallback when a tenant has no timezone configured. Matches
 * tenant_settings.timezone's own DB default (001_baseline.sql), so an
 * unset value behaves identically to before this module existed.
 */
export const DEFAULT_TENANT_TIMEZONE = 'America/Los_Angeles';

/**
 * Resolves a tenant's configured timezone, falling back to the documented
 * default when unset. Pure/synchronous - callers that need the tenant's
 * timezone from the database call tenantService.getTenantSettings
 * themselves and pass the result in here; this module never touches the DB.
 */
export function resolveTenantTimezone(timezone: string | null | undefined): string {
  return timezone && timezone.trim() ? timezone : DEFAULT_TENANT_TIMEZONE;
}

/**
 * Today's date as YYYY-MM-DD in the given timezone. Never
 * toISOString().split('T')[0] - that reads the UTC calendar date, which
 * differs from the tenant's calendar date for roughly half of every day.
 */
export function tenantToday(timezone: string, reference: Date = new Date()): string {
  return format(toZonedTime(reference, timezone), 'yyyy-MM-dd');
}

/**
 * Tomorrow's date as YYYY-MM-DD in the given timezone.
 */
export function tenantTomorrow(timezone: string, reference: Date = new Date()): string {
  const zoned = toZonedTime(reference, timezone);
  return format(addDays(zoned, 1), 'yyyy-MM-dd');
}

/**
 * Adds `days` (may be negative) to `dateStr` (YYYY-MM-DD, interpreted in
 * the tenant's timezone) and returns the result, also as YYYY-MM-DD.
 */
export function addTenantDays(dateStr: string, days: number, timezone: string): string {
  const zonedInstant = fromZonedTime(`${dateStr} 00:00:00`, timezone);
  const zoned = toZonedTime(zonedInstant, timezone);
  return format(addDays(zoned, days), 'yyyy-MM-dd');
}

/**
 * Formats a Date (a real UTC instant) as a string in the given timezone.
 * General-purpose - used for YYYY-MM-DD extraction, HH:mm:ss extraction,
 * and human-readable formats (e.g. lesson invite dates). format string
 * follows date-fns's token syntax.
 */
export function formatInTenantZone(
  date: Date,
  timezone: string,
  formatStr: string = 'yyyy-MM-dd'
): string {
  return formatInTimeZone(date, timezone, formatStr);
}

/**
 * The inverse of formatInTenantZone: given a YYYY-MM-DD date and an
 * HH:MM or HH:MM:SS time meant as wall-clock in the tenant's timezone,
 * returns the correct UTC Date instant. This is the primitive that fixes
 * slot serialization and lesson storage - it replaces constructing a Date
 * with setHours() (which sets the PROCESS's local time) or parsing a
 * naive `${date}T${time}` string (same problem, implicitly).
 */
export function zonedWallClockToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return fromZonedTime(`${dateStr} ${normalizedTime}`, timezone);
}

/**
 * Start/end of the reference month (default: tenant "now") as YYYY-MM-DD
 * strings, in the tenant's timezone.
 */
export function tenantMonthBoundaries(
  timezone: string,
  reference: Date = new Date()
): { start: string; end: string } {
  const zoned = toZonedTime(reference, timezone);
  return {
    start: format(startOfMonth(zoned), 'yyyy-MM-dd'),
    end: format(endOfMonth(zoned), 'yyyy-MM-dd'),
  };
}

/**
 * Start/end of the month AFTER the reference month (default: tenant "now")
 * as YYYY-MM-DD strings, in the tenant's timezone. Composed entirely from
 * this module's own exports (never a hand-rolled month-add) so the
 * 31-day-to-30-day and December-to-January cases are handled by the same
 * date-fns machinery tenantMonthBoundaries already relies on: get this
 * month's boundaries, step one day past its end (guaranteed to land in
 * next month regardless of this month's length), then ask
 * tenantMonthBoundaries for THAT month's boundaries.
 */
export function tenantNextMonthBoundaries(
  timezone: string,
  reference: Date = new Date()
): { start: string; end: string } {
  const thisMonth = tenantMonthBoundaries(timezone, reference);
  const firstDayNextMonth = addTenantDays(thisMonth.end, 1, timezone);
  const referenceNextMonth = zonedWallClockToUtc(firstDayNextMonth, '00:00', timezone);
  return tenantMonthBoundaries(timezone, referenceNextMonth);
}

/**
 * Day of week (0 = Sunday, 6 = Saturday) for a YYYY-MM-DD date string,
 * interpreted in the tenant's timezone. Replaces reading .getDay() off a
 * Date constructed in the process's own local time.
 */
export function tenantDayOfWeek(dateStr: string, timezone: string): number {
  const zonedInstant = fromZonedTime(`${dateStr} 00:00:00`, timezone);
  return toZonedTime(zonedInstant, timezone).getUTCDay();
}

/**
 * Parses a YYYY-MM-DD date string (as produced by this module) into a
 * plain Date at UTC midnight of that calendar date - for callers (e.g.
 * calculateAge) that need a Date object to compare year/month/day
 * components against, not a real "instant." Never use `new Date(dateStr)`
 * directly for this - depending on the string shape it can be parsed as
 * either UTC or process-local, which is exactly the ambiguity this module
 * exists to remove.
 */
export function parseTenantDateOnly(dateStr: string): Date {
  return parseISO(dateStr);
}

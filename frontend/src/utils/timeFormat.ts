/**
 * Time formatting utilities
 * Converts between 24-hour and 12-hour formats
 */

/**
 * Format time from HH:MM (24-hour) to 12-hour format with AM/PM
 * @param time24 - Time in HH:MM format (e.g., "14:30")
 * @returns Formatted time (e.g., "2:30 PM")
 */
export const format12Hour = (time24: string): string => {
  const [hoursStr, minutesStr] = time24.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr || '00';

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes} ${ampm}`;
};

/**
 * Format ISO datetime string to 12-hour format
 * @param isoString - ISO 8601 datetime string
 * @returns Formatted time (e.g., "2:30 PM")
 */
export const formatISOTo12Hour = (isoString: string): string => {
  const date = new Date(isoString);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, '0');

  return `${displayHour}:${minutesStr} ${ampm}`;
};

/**
 * Parse YYYY-MM-DD date string in local timezone (not UTC)
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns Date object in local timezone
 */
export const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Format a Date object as YYYY-MM-DD using its LOCAL calendar date, not UTC.
 * date.toISOString().split('T')[0] converts to UTC first, which rolls the
 * date back a day for any local time before midnight UTC (e.g. any evening
 * hour in US timezones) - this reads the local year/month/day fields
 * directly instead.
 * @param date - Date object
 * @returns Date string in YYYY-MM-DD format, in the date's local timezone
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date to short format (e.g., "Mon, Jan 15")
 * @param date - Date object or YYYY-MM-DD string
 * @returns Formatted date string
 */
export const formatShortDate = (date: Date | string): string => {
  // If string, parse as local date (not UTC)
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format date and time together (e.g., "Mon, Jan 15 at 2:30 PM")
 * @param date - Date object or date string
 * @param time24 - Time in HH:MM format
 * @returns Formatted datetime string
 */
export const formatDateTime = (date: Date | string, time24: string): string => {
  const dateStr = formatShortDate(date);
  const timeStr = format12Hour(time24);
  return `${dateStr} at ${timeStr}`;
};

/**
 * Add N calendar days to a YYYY-MM-DD date string, returning a YYYY-MM-DD
 * string. Pure calendar-day arithmetic on an already-resolved local date -
 * not tenant-timezone interpretation of an instant, so this is safe to use
 * client-side even where tenant-timezone date math itself must stay
 * backend-only (see backend/src/utils/tenantTime.ts).
 * @param dateStr - Date in YYYY-MM-DD format
 * @param days - Number of days to add (may be negative)
 * @returns Date string in YYYY-MM-DD format
 */
export const addCalendarDays = (dateStr: string, days: number): string => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
};

/**
 * Number of calendar days between two YYYY-MM-DD date strings (end - start).
 * @param startDateStr - Date in YYYY-MM-DD format
 * @param endDateStr - Date in YYYY-MM-DD format
 * @returns Whole number of days between the two dates
 */
export const daysBetween = (startDateStr: string, endDateStr: string): number => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = parseLocalDate(startDateStr);
  const end = parseLocalDate(endDateStr);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
};

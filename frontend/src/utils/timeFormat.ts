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

/**
 * Time Preference Bucketing
 *
 * lessons has no time-of-day-preference column - "Book again" derives one
 * from a historical lesson's start_time so the wizard can prefill the
 * Time Preference chips. The bucket boundaries here MUST mirror
 * backend/src/services/schedulingService.ts's filterByTimePreference
 * exactly (morning 6-12, afternoon 12-17, evening 17-21) so the two never
 * drift - this file operates on an already-resolved HH:MM string (the
 * tenant wall-clock time the backend already stored the lesson at), not a
 * raw instant, so it is presentation-layer bucketing, not tenant-timezone
 * date math, and does not touch backend/src/utils/tenantTime.ts.
 */

import type { TimePreference } from '@/components/scheduling/SmartBookingForm/SetupStep';

/**
 * Buckets an HH:MM (or HH:MM:SS) time-of-day string into a TimePreference.
 * Returns 'any' for a time outside all three windows (before 6am or at/after
 * 9pm) - there's no "night" bucket in the wizard's own chip set, so 'any'
 * is the closest honest default rather than inventing a bucket that
 * doesn't exist as a selectable option.
 */
export function bucketTimePreference(time: string | null | undefined): TimePreference {
  if (!time) return 'any';

  const hour = parseInt(time.split(':')[0], 10);
  if (Number.isNaN(hour)) return 'any';

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'any';
}

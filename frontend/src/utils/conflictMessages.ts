import { SchedulingConflict } from '@/types';

/**
 * Friendly, actionable copy for each structured conflict type the backend
 * can report. Keyed by the real SchedulingConflict['type'] value now that
 * the backend exposes conflictType directly, instead of guessing the type
 * via substring-matching the raw error message.
 */
export const CONFLICT_MESSAGES: Record<SchedulingConflict['type'], string> = {
  instructor_busy: 'This instructor already has another lesson at this time. Please choose a different time slot.',
  student_busy: 'This student already has another lesson scheduled at this time. Please choose a different time slot.',
  buffer_violation: 'There needs to be a 30-minute buffer between lessons. Please choose a time slot with more spacing.',
  capacity_reached: 'This instructor has reached their maximum students for the day. Please choose a different day.',
  outside_working_hours: 'This time is outside the instructor\'s available hours. Please choose a different time slot.',
  vehicle_busy: 'The vehicle is already in use at this time. Please choose a different time slot.',
  time_off: 'The instructor has time off during this period. Please choose a different time slot.',
  student_daily_limit: 'This student has reached their maximum number of lessons for this day. Please choose a different day.',
};

/**
 * Resolve a friendly conflict message from a structured conflictType when
 * available, falling back to the raw backend message for unknown/missing
 * codes (e.g. a validation error that isn't a scheduling conflict at all).
 */
export const getConflictMessage = (
  conflictType: string | undefined,
  fallbackMessage: string
): string => {
  if (conflictType && conflictType in CONFLICT_MESSAGES) {
    return CONFLICT_MESSAGES[conflictType as SchedulingConflict['type']];
  }
  return fallbackMessage;
};

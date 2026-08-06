/**
 * Turning-18 Alert Predicate
 *
 * Fires only when a student is on the hours track (age-derived or pinned
 * via trackOverride) and has NOT already booked enough remaining lessons to
 * finish - completed hours PLUS already-scheduled hours must be less than
 * hours_required. A student who has booked enough lessons to finish must
 * NOT trigger this alert, even if they haven't completed those hours yet.
 *
 * All numbers consumed here come from the backend-computed progress
 * payload (student.progress) - this is a threshold comparison on already-
 * computed fields, not a re-derivation of progress.
 */

import type { Student } from '@/types';
import { calculateAge } from './age';

export function needsTurning18Alert(student: Student): boolean {
  if (!student.progress || student.progress.track !== 'hours') return false;
  if (student.progress.needsDateOfBirth) return false;

  const age = calculateAge(student.dateOfBirth ?? null);
  if (age === null || age < 18) return false;

  const hoursCompleted = student.progress.hoursCompleted ?? 0;
  const hoursScheduled = student.progress.hoursScheduled ?? 0;
  const hoursRequired = student.progress.hoursRequired ?? 0;

  return hoursCompleted + hoursScheduled < hoursRequired;
}

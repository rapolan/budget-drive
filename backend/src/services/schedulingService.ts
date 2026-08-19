/**
 * Scheduling Service
 * Smart scheduling logic: find available slots, detect conflicts, validate bookings
 */

import { query } from '../config/database';
import {
  TimeSlot,
  SchedulingConflict,
  AvailabilityRequest,
  RankedTimeSlot,
  RankedAvailabilityRequest,
  RankedAvailabilityResult,
} from '../types';
import { getSchedulingSettings } from './availabilityService';
import { getTenantSettings } from './tenantService';
import { getServiceAreasForInstructorsBatch } from './instructorServiceAreaService';
import { extractZipCode, calculateProximityScore } from '../utils/zipCode';
import { AppError } from '../middleware/errorHandler';
import {
  resolveTenantTimezone,
  formatInTenantZone,
  tenantDayOfWeek,
  tenantTomorrow,
  addTenantDays,
  zonedWallClockToUtc,
  parseTenantDateOnly,
} from '../utils/tenantTime';

// Helper function to parse time string to minutes since midnight
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Resolves the tenant's configured timezone (Constraint B/C - all date/
// wall-clock interpretation in this file goes through backend/src/utils/
// tenantTime.ts, never server-local Date getters). Exported so other
// services (e.g. bookingPresetsService) reuse this exact resolution
// instead of duplicating the getTenantSettings/resolveTenantTimezone pair.
export const resolveTimezone = async (tenantId: string): Promise<string> => {
  const settings = await getTenantSettings(tenantId);
  return resolveTenantTimezone(settings?.timezone);
};

// Format a Date as YYYY-MM-DD in the tenant's timezone (replaces the old
// server-local formatDate helper).
const formatDate = (date: Date, timezone: string): string =>
  formatInTenantZone(date, timezone, 'yyyy-MM-dd');

/**
 * Find available time slots for scheduling lessons.
 *
 * Batched: issues a small, fixed number of queries for the whole request
 * (settings, instructor list, availability, time-off, lessons) rather than
 * looping per-day-per-instructor, then computes availability/time-off/slot
 * generation entirely in memory from the pre-fetched data.
 */
export const findAvailableSlots = async (
  request: AvailabilityRequest
): Promise<TimeSlot[]> => {
  const { tenantId, instructorId, vehicleId, startDate, endDate, studentId } = request;

  // Coerced once, here, rather than at every downstream use - duration is a
  // number in the type system but Postgres numeric columns (and any caller
  // that reuses a stored lesson's duration) can hand this function a
  // numeric string at runtime. Every use below (findSlotsInBlock's
  // arithmetic, and the duration stored onto each returned TimeSlot) reads
  // this coerced value, not request.duration directly.
  const duration = Number(request.duration);
  if (!Number.isFinite(duration)) {
    throw new AppError(`Invalid lesson duration: ${request.duration}`, 400);
  }

  const timezone = request.timezone ?? (await resolveTimezone(tenantId));
  const settings = await getSchedulingSettings(tenantId);
  const bufferTime = settings.bufferTimeBetweenLessons;
  const startDateStr = formatDate(startDate, timezone);
  const endDateStr = formatDate(endDate, timezone);

  // Student daily limit (tenant_settings.max_lessons_per_student_per_day,
  // default 1) - only needed when a studentId is given; a day the student
  // is already at the cap is skipped entirely below, regardless of time.
  const maxLessonsPerStudentPerDay = studentId
    ? (await getTenantSettings(tenantId))?.maxLessonsPerStudentPerDay ?? 1
    : Infinity;

  // Get instructors to check (either specific one or all active instructors)
  let instructorsToCheck: string[] = [];
  if (instructorId) {
    instructorsToCheck = [instructorId];
  } else {
    const instructorsResult = await query(
      `SELECT id FROM instructors WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );
    instructorsToCheck = instructorsResult.rows.map((row: any) => row.id);
  }

  if (instructorsToCheck.length === 0) {
    return [];
  }

  // Query 1: availability blocks for ALL candidate instructors, keyed by
  // (instructorId, dayOfWeek). day_of_week is static, so one query covers
  // every day in the range regardless of how many days are requested.
  const availabilityResult = await query(
    `SELECT instructor_id, day_of_week, start_time, end_time, max_students
     FROM instructor_availability
     WHERE instructor_id = ANY($1) AND tenant_id = $2 AND is_active = true
     ORDER BY instructor_id, day_of_week, start_time`,
    [instructorsToCheck, tenantId]
  );
  const availabilityByInstructorDay = new Map<string, any[]>();
  for (const row of availabilityResult.rows) {
    const key = `${row.instructor_id}|${row.day_of_week}`;
    const existing = availabilityByInstructorDay.get(key) || [];
    existing.push(row);
    availabilityByInstructorDay.set(key, existing);
  }

  // Query 2: approved time-off for ALL candidate instructors overlapping the
  // whole requested date range.
  const timeOffResult = await query(
    `SELECT instructor_id, start_date, end_date, start_time, end_time
     FROM instructor_time_off
     WHERE instructor_id = ANY($1) AND tenant_id = $2
     AND start_date <= $4 AND end_date >= $3
     AND is_approved = true`,
    [instructorsToCheck, tenantId, startDateStr, endDateStr]
  );
  const timeOffByInstructor = new Map<string, any[]>();
  for (const row of timeOffResult.rows) {
    const existing = timeOffByInstructor.get(row.instructor_id) || [];
    existing.push(row);
    timeOffByInstructor.set(row.instructor_id, existing);
  }

  // Query 3: lessons for ALL candidate instructors in the date range (used
  // for the Instructor dimension's overlap exclusion).
  const lessonsResult = await query(
    `SELECT instructor_id, date, start_time, end_time
     FROM lessons
     WHERE instructor_id = ANY($1) AND tenant_id = $2
     AND date >= $3 AND date <= $4
     AND status NOT IN ('cancelled', 'no_show')`,
    [instructorsToCheck, tenantId, startDateStr, endDateStr]
  );
  const lessonsByInstructorDate = new Map<string, any[]>();
  for (const row of lessonsResult.rows) {
    // row.date is a plain DATE column (no time component) - a Date instance
    // from pg is always UTC midnight of that calendar date, so this key
    // needs no tenant-zone conversion (there's no wall-clock to interpret).
    const dateKey = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
    const key = `${row.instructor_id}|${dateKey}`;
    const existing = lessonsByInstructorDate.get(key) || [];
    existing.push(row);
    lessonsByInstructorDate.set(key, existing);
  }

  // Query 4: the student's own lessons in the date range, so we never offer
  // a slot that overlaps a lesson the student already has booked (Student
  // dimension) - independent of which instructor the slot belongs to.
  const studentLessonsByDate = new Map<string, any[]>();
  if (studentId) {
    const studentLessonsResult = await query(
      `SELECT date, start_time, end_time
       FROM lessons
       WHERE student_id = $1 AND tenant_id = $2
       AND date >= $3 AND date <= $4
       AND status NOT IN ('cancelled', 'no_show')`,
      [studentId, tenantId, startDateStr, endDateStr]
    );
    for (const row of studentLessonsResult.rows) {
      // Same DATE-column reasoning as the instructor lessons map above.
      const dateKey = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
      const existing = studentLessonsByDate.get(dateKey) || [];
      existing.push(row);
      studentLessonsByDate.set(dateKey, existing);
    }
  }

  const availableSlots: TimeSlot[] = [];
  const vehicleForLesson: string | null = vehicleId || null;

  // Everything below is computed in memory - no further queries. Walk
  // TENANT calendar dates as strings (via addTenantDays), not a process-
  // local Date stepped with setDate/getDate - the day-walk itself must
  // resolve in tenant time, same as everything it derives.
  let dateCursor = startDateStr;

  while (dateCursor <= endDateStr) {
    const dayOfWeek = tenantDayOfWeek(dateCursor, timezone);
    const dateStr = dateCursor;

    for (const instId of instructorsToCheck) {
      const blocksForDay = availabilityByInstructorDay.get(`${instId}|${dayOfWeek}`) || [];
      if (blocksForDay.length === 0) {
        continue; // Instructor doesn't work on this day
      }

      // Time off: whole-day time-off (no start_time/end_time set) blocks the
      // entire day; partial-day time-off only excludes overlapping blocks,
      // handled per-block below (matches checkSchedulingConflicts's logic).
      const timeOffForInstructor = timeOffByInstructor.get(instId) || [];
      const timeOffToday = timeOffForInstructor.filter(
        (t) => t.start_date <= dateStr && t.end_date >= dateStr
      );
      const wholeDayBlocked = timeOffToday.some((t) => !t.start_time || !t.end_time);
      if (wholeDayBlocked) {
        continue;
      }
      const partialDayTimeOff = timeOffToday.filter((t) => t.start_time && t.end_time);

      const instructorLessons = lessonsByInstructorDate.get(`${instId}|${dateStr}`) || [];
      const studentLessonsToday = studentLessonsByDate.get(dateStr) || [];

      // Student daily limit: once the student already has as many lessons
      // this day as the tenant allows, skip the whole day for them -
      // regardless of time, mirroring checkSchedulingConflicts's
      // student_daily_limit check so slot search never offers what booking
      // would immediately reject.
      if (studentLessonsToday.length >= maxLessonsPerStudentPerDay) {
        continue;
      }

      // Combine instructor's lessons with the student's own lessons that day
      // (Student dimension) - findSlotsInBlock excludes any theoretical slot
      // overlapping ANY entry in this list, regardless of whose lesson it is
      const existingLessons = [...instructorLessons, ...studentLessonsToday];

      for (const block of blocksForDay) {
        const blockStart = timeToMinutes(block.start_time);
        const blockEnd = timeToMinutes(block.end_time);
        const maxSlotsForBlock = block.max_students ?? settings.defaultMaxStudentsPerDay;

        let slots = findSlotsInBlock(
          blockStart,
          blockEnd,
          maxSlotsForBlock,
          existingLessons,
          duration,
          bufferTime
        );

        // Exclude any slot overlapping a partial-day time-off window
        for (const timeOff of partialDayTimeOff) {
          const offStart = timeToMinutes(timeOff.start_time);
          const offEnd = timeToMinutes(timeOff.end_time);
          slots = slots.filter((slot) => !(slot.start < offEnd && slot.end > offStart));
        }

        for (const slot of slots) {
          // The slot's minutes-since-midnight are tenant wall-clock minutes
          // on dateStr - zonedWallClockToUtc converts that intended
          // wall-clock moment to the correct UTC instant, replacing the old
          // new Date(currentDate); setHours(...) (which set the PROCESS's
          // local time, not the tenant's).
          const startHHMM = `${String(Math.floor(slot.start / 60)).padStart(2, '0')}:${String(slot.start % 60).padStart(2, '0')}`;
          const endHHMM = `${String(Math.floor(slot.end / 60)).padStart(2, '0')}:${String(slot.end % 60).padStart(2, '0')}`;
          const slotStart = zonedWallClockToUtc(dateStr, startHHMM, timezone);
          const slotEnd = zonedWallClockToUtc(dateStr, endHHMM, timezone);

          availableSlots.push({
            date: dateStr,
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            // Tenant wall-clock HH:MM - the frontend must read these
            // directly for display/booking, never derive them by parsing
            // startTime/endTime's ISO instant with the browser's own
            // getHours()/getMinutes() (see docs/ARCHITECTURE.md §7).
            startTimeLocal: startHHMM,
            endTimeLocal: endHHMM,
            instructorId: instId,
            vehicleId: vehicleForLesson ?? null,
            duration,
            available: true,
            reason: undefined,
          });
        }
      }
    }

    dateCursor = addTenantDays(dateCursor, 1, timezone);
  }

  return availableSlots;
};

/**
 * Find free slots within a single availability block using capacity-based
 * scheduling. Generates up to maxSlots slots, but never lets a slot run past
 * the block's own end_time - once a theoretical slot would end after
 * blockEnd, generation stops (this matters once an instructor can have
 * multiple blocks/day, e.g. a split shift, and each block is capped to its
 * own window rather than bleeding into the next block's time).
 *
 * @param blockStart - Block's start time in minutes since midnight
 * @param blockEnd - Block's end time in minutes since midnight
 * @param maxSlots - Maximum number of students per day (from settings or instructor override)
 * @param existingLessons - Already booked lessons for this day
 * @param duration - Lesson duration in minutes (e.g., 120 for 2 hours)
 * @param bufferTime - Buffer time between lessons in minutes (e.g., 30)
 * @returns Array of available time slots
 *
 * Example: blockStart=540 (9am), blockEnd=1020 (5pm), maxSlots=3, duration=120, buffer=30
 * Generates up to 3 slots, each capped to end by 5pm:
 *   Slot 1: 9:00-11:00 (540-660)
 *   Slot 2: 11:30-1:30 (690-810)
 *   Slot 3: 2:00-4:00 (840-960)
 */
function findSlotsInBlock(
  blockStart: number,
  blockEnd: number,
  maxSlots: number,
  existingLessons: any[],
  duration: number,
  bufferTime: number
): Array<{ start: number; end: number }> {
  const slots: Array<{ start: number; end: number }> = [];

  // Defense in depth: the route layer (validateNumeric) already guarantees
  // a real number for any request reaching this via the HTTP API, but this
  // function has other/future callers (direct service calls, scripts) that
  // could bypass that gate - coerce here too so `currentTime + duration`
  // below can never silently string-concatenate (e.g. 540 + "60.00" =
  // "54060.00") instead of adding, which would make every theoretical slot
  // fail the blockEnd check on the very first iteration.
  const safeDuration = Number(duration);
  if (!Number.isFinite(safeDuration)) {
    throw new AppError(`Invalid lesson duration: ${duration}`, 400);
  }

  // Generate the theoretical slots for the block (based on capacity, capped
  // to the block's own end_time)
  const theoreticalSlots: Array<{ start: number; end: number }> = [];
  let currentTime = blockStart;

  for (let i = 0; i < maxSlots; i++) {
    const slotStart = currentTime;
    const slotEnd = currentTime + safeDuration;

    if (slotEnd > blockEnd) {
      break; // This and any further slot would run past the block's end
    }

    theoreticalSlots.push({ start: slotStart, end: slotEnd });

    // Move to next slot (add lesson duration + buffer)
    currentTime = slotEnd + bufferTime;
  }

  // Filter out slots that conflict with existing lessons
  for (const theoreticalSlot of theoreticalSlots) {
    let hasConflict = false;

    for (const lesson of existingLessons) {
      const lessonStart = timeToMinutes(lesson.start_time);
      const lessonEnd = timeToMinutes(lesson.end_time);

      // Check if theoretical slot overlaps with existing lesson
      if (
        (theoreticalSlot.start < lessonEnd && theoreticalSlot.end > lessonStart) ||
        (theoreticalSlot.start >= lessonStart && theoreticalSlot.start < lessonEnd)
      ) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      slots.push(theoreticalSlot);
    }
  }

  return slots;
}

/**
 * Check for scheduling conflicts before booking a lesson
 */
export const checkSchedulingConflicts = async (
  tenantId: string,
  instructorId: string,
  studentId: string,
  vehicleId: string | null,
  startTime: Date,
  endTime: Date,
  excludeLessonId?: string
): Promise<SchedulingConflict[]> => {
  const conflicts: SchedulingConflict[] = [];
  const timezone = await resolveTimezone(tenantId);
  const settings = await getSchedulingSettings(tenantId);

  const dateStr = formatDate(startTime, timezone);
  const dayOfWeek = tenantDayOfWeek(dateStr, timezone);
  const startTimeStr = formatInTenantZone(startTime, timezone, 'HH:mm:ss');
  const endTimeStr = formatInTenantZone(endTime, timezone, 'HH:mm:ss');
  const startMinutes = timeToMinutes(startTimeStr);
  const endMinutes = timeToMinutes(endTimeStr);

  // 1. Check if instructor has availability on this day/time
  // ORDER BY narrows to the most specific containing block first, so that
  // if more than one row happens to satisfy the containment filter (e.g.
  // overlapping availability rows), which block's max_students gets used
  // below is deterministic rather than whatever order Postgres returns.
  const availabilityResult = await query(
    `SELECT * FROM instructor_availability
     WHERE instructor_id = $1 AND tenant_id = $2 AND day_of_week = $3 AND is_active = true
     AND start_time <= $4 AND end_time >= $5
     ORDER BY start_time DESC, end_time ASC`,
    [instructorId, tenantId, dayOfWeek, startTimeStr, endTimeStr]
  );

  if (availabilityResult.rows.length === 0) {
    conflicts.push({
      type: 'outside_working_hours',
      message: 'Instructor is not available during this time',
    });
  }

  // 2. Check capacity: instructor's non-cancelled lesson count for this day
  // against max_students (the containing availability block's override from
  // check #1 above, else tenant default)
  const maxStudentsForDay =
    availabilityResult.rows[0]?.max_students ?? settings.defaultMaxStudentsPerDay;

  let dailyLessonCountQuery = `
    SELECT COUNT(*) FROM lessons
    WHERE instructor_id = $1 AND tenant_id = $2 AND date = $3
    AND status NOT IN ('cancelled', 'no_show')
  `;
  const dailyLessonCountParams: any[] = [instructorId, tenantId, dateStr];

  if (excludeLessonId) {
    dailyLessonCountQuery += ` AND id != $4`;
    dailyLessonCountParams.push(excludeLessonId);
  }

  const dailyLessonCountResult = await query(dailyLessonCountQuery, dailyLessonCountParams);

  const dailyLessonCount = parseInt(dailyLessonCountResult.rows[0].count, 10);

  if (dailyLessonCount >= maxStudentsForDay) {
    conflicts.push({
      type: 'capacity_reached',
      message: `Instructor has reached their maximum of ${maxStudentsForDay} lessons for this day`,
    });
  }

  // 3. Check for instructor time off
  const timeOffResult = await query(
    `SELECT * FROM instructor_time_off
     WHERE instructor_id = $1 AND tenant_id = $2
     AND start_date <= $3 AND end_date >= $3
     AND is_approved = true`,
    [instructorId, tenantId, dateStr]
  );

  if (timeOffResult.rows.length > 0) {
    const timeOff = timeOffResult.rows[0];
    // Check if time overlaps (if specific times are set)
    if (!timeOff.start_time || !timeOff.end_time) {
      conflicts.push({
        type: 'time_off',
        message: 'Instructor has time off on this day',
        conflictingTimeOffId: timeOff.id,
      });
    } else {
      const offStart = timeToMinutes(timeOff.start_time);
      const offEnd = timeToMinutes(timeOff.end_time);
      if (startMinutes < offEnd && endMinutes > offStart) {
        conflicts.push({
          type: 'time_off',
          message: 'Instructor has time off during this period',
          conflictingTimeOffId: timeOff.id,
        });
      }
    }
  }

  // 4. Check for overlapping lessons for instructor
  let lessonQuery = `
    SELECT id FROM lessons
    WHERE instructor_id = $1 AND tenant_id = $2
    AND date = $3
    AND status NOT IN ('cancelled', 'no_show')
    AND (
      (start_time <= $4 AND end_time > $4)
      OR (start_time < $5 AND end_time >= $5)
      OR (start_time >= $4 AND end_time <= $5)
    )
  `;
  const lessonParams: any[] = [instructorId, tenantId, dateStr, startTimeStr, endTimeStr];

  if (excludeLessonId) {
    lessonQuery += ` AND id != $6`;
    lessonParams.push(excludeLessonId);
  }

  const instructorLessonsResult = await query(lessonQuery, lessonParams);

  if (instructorLessonsResult.rows.length > 0) {
    conflicts.push({
      type: 'instructor_busy',
      message: 'Instructor already has a lesson during this time',
      conflictingLessonId: instructorLessonsResult.rows[0].id,
    });
  }

  // 5. Check for buffer time violations
  const bufferMinutes = settings.bufferTimeBetweenLessons;
  const beforeBufferStart = new Date(startTime);
  beforeBufferStart.setMinutes(beforeBufferStart.getMinutes() - bufferMinutes);
  const afterBufferEnd = new Date(endTime);
  afterBufferEnd.setMinutes(afterBufferEnd.getMinutes() + bufferMinutes);

  let bufferQuery = `
    SELECT id FROM lessons
    WHERE instructor_id = $1 AND tenant_id = $2 AND date = $3
    AND status NOT IN ('cancelled', 'no_show')
    AND (
      (end_time > $4 AND end_time <= $5)
      OR (start_time >= $6 AND start_time < $7)
    )
  `;
  const bufferParams: any[] = [
    instructorId,
    tenantId,
    dateStr,
    formatInTenantZone(beforeBufferStart, timezone, 'HH:mm:ss'),
    startTimeStr,
    endTimeStr,
    formatInTenantZone(afterBufferEnd, timezone, 'HH:mm:ss'),
  ];

  if (excludeLessonId) {
    bufferQuery += ` AND id != $8`;
    bufferParams.push(excludeLessonId);
  }

  const bufferViolationResult = await query(bufferQuery, bufferParams);

  if (bufferViolationResult.rows.length > 0 && !settings.allowBackToBackLessons) {
    conflicts.push({
      type: 'buffer_violation',
      message: `Insufficient buffer time (${bufferMinutes} minutes required)`,
      conflictingLessonId: bufferViolationResult.rows[0].id,
    });
  }

  // 6. Check vehicle availability (if vehicle is school-owned)
  if (vehicleId) {
    const vehicleCheck = await query(
      `SELECT ownership_type, owner_instructor_id FROM vehicles WHERE id = $1 AND tenant_id = $2`,
      [vehicleId, tenantId]
    );

    if (vehicleCheck.rows.length > 0) {
      const vehicle = vehicleCheck.rows[0];

      // Only check availability for school-owned vehicles
      if (vehicle.ownership_type === 'school_owned' || !vehicle.owner_instructor_id) {
        let vehicleLessonQuery = `
          SELECT id FROM lessons
          WHERE vehicle_id = $1 AND tenant_id = $2 AND date = $3
          AND status NOT IN ('cancelled', 'no_show')
          AND (
            (start_time <= $4 AND end_time > $4)
            OR (start_time < $5 AND end_time >= $5)
            OR (start_time >= $4 AND end_time <= $5)
          )
        `;
        const vehicleParams: any[] = [vehicleId, tenantId, dateStr, startTimeStr, endTimeStr];

        if (excludeLessonId) {
          vehicleLessonQuery += ` AND id != $6`;
          vehicleParams.push(excludeLessonId);
        }

        const vehicleLessonsResult = await query(vehicleLessonQuery, vehicleParams);

        if (vehicleLessonsResult.rows.length > 0) {
          conflicts.push({
            type: 'vehicle_busy',
            message: 'Vehicle is already assigned to another lesson',
            conflictingLessonId: vehicleLessonsResult.rows[0].id,
          });
        }
      }
    }
  }

  // 7. Check for student conflicts (optional - if we want to prevent double-booking students)
  if (studentId) {
    let studentLessonQuery = `
      SELECT id FROM lessons
      WHERE student_id = $1 AND tenant_id = $2 AND date = $3
      AND status NOT IN ('cancelled', 'no_show')
      AND (
        (start_time <= $4 AND end_time > $4)
        OR (start_time < $5 AND end_time >= $5)
        OR (start_time >= $4 AND end_time <= $5)
      )
    `;
    const studentParams: any[] = [studentId, tenantId, dateStr, startTimeStr, endTimeStr];

    if (excludeLessonId) {
      studentLessonQuery += ` AND id != $6`;
      studentParams.push(excludeLessonId);
    }

    const studentLessonsResult = await query(studentLessonQuery, studentParams);

    if (studentLessonsResult.rows.length > 0) {
      conflicts.push({
        type: 'student_busy',
        message: 'Student already has a lesson scheduled during this time',
        conflictingLessonId: studentLessonsResult.rows[0].id,
      });
    }

    // 8. Check student daily limit: a student may only have so many lessons
    // booked on the same calendar day (tenant_settings.max_lessons_per_student
    // _per_day, default 1), regardless of whether this new time overlaps an
    // existing one (check #7 already covers overlap) - this catches a second,
    // non-overlapping lesson the same day. excludeLessonId honored so
    // rescheduling one of the student's own lessons within its own day
    // (moving its time but keeping the date) doesn't trip against itself.
    const tenantSettings = await getTenantSettings(tenantId);
    const maxLessonsPerStudentPerDay = tenantSettings?.maxLessonsPerStudentPerDay ?? 1;

    let studentDailyCountQuery = `
      SELECT COUNT(*) FROM lessons
      WHERE student_id = $1 AND tenant_id = $2 AND date = $3
      AND status NOT IN ('cancelled', 'no_show')
    `;
    const studentDailyCountParams: string[] = [studentId, tenantId, dateStr];

    if (excludeLessonId) {
      studentDailyCountQuery += ` AND id != $4`;
      studentDailyCountParams.push(excludeLessonId);
    }

    const studentDailyCountResult = await query(studentDailyCountQuery, studentDailyCountParams);
    const studentDailyCount = parseInt(studentDailyCountResult.rows[0].count, 10);

    if (studentDailyCount >= maxLessonsPerStudentPerDay) {
      conflicts.push({
        type: 'student_daily_limit',
        message: `Student has reached their maximum of ${maxLessonsPerStudentPerDay} lesson${maxLessonsPerStudentPerDay === 1 ? '' : 's'} for this day`,
      });
    }
  }

  return conflicts;
};

/**
 * Validate a lesson booking (wrapper around checkSchedulingConflicts)
 */
export const validateLessonBooking = async (
  tenantId: string,
  instructorId: string,
  studentId: string,
  vehicleId: string | null,
  startTime: Date,
  endTime: Date,
  excludeLessonId?: string
): Promise<{ valid: boolean; conflicts: SchedulingConflict[] }> => {
  const conflicts = await checkSchedulingConflicts(
    tenantId,
    instructorId,
    studentId,
    vehicleId,
    startTime,
    endTime,
    excludeLessonId
  );

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
};

/**
 * Find available slots ranked by proximity to a pickup zip code.
 *
 * Runs the (batched) 6D search across candidate instructors - either all
 * active instructors, or just `instructorId` if scoped to one - then, for
 * each slot, works out where the instructor would be coming from (their
 * last lesson that day ending before the slot, else their home zip) and
 * scores that against `pickupZip`. Slots are sorted by proximity score
 * (descending) then date/time (ascending), matching the ordering the
 * frontend previously computed client-side.
 */
// A custom range wider than this is rejected - bounds findRankedAvailableSlots's
// per-day, per-instructor scan against a pathological "anytime this year"
// query while still covering multi-month advance planning (state permit/
// road-test scheduling windows commonly run 3-6 months out).
export const MAX_DATE_RANGE_DAYS = 180;

export const findRankedAvailableSlots = async (
  request: RankedAvailabilityRequest
): Promise<RankedAvailabilityResult> => {
  const { tenantId, studentId, pickupZip, duration, startDate: requestedStart, endDate: requestedEnd, timePreference, instructorId } = request;

  const timezone = await resolveTimezone(tenantId);

  // "Tomorrow" and the search window's end both resolve in TENANT time, not
  // server "now" - the previous new Date() here was the single most
  // consequential server-local-time site in this file (see docs/
  // ARCHITECTURE.md's tenant-timezone section). When the caller omits an
  // explicit range, this is the same 14-day default that has always applied
  // (tomorrow through 13 days later).
  const startDateStr = requestedStart ?? tenantTomorrow(timezone);
  const endDateStr = requestedEnd ?? addTenantDays(startDateStr, 13, timezone);

  if (endDateStr < startDateStr) {
    throw new AppError('endDate must not be before startDate', 400);
  }
  const spanDays = (parseTenantDateOnly(endDateStr).getTime() - parseTenantDateOnly(startDateStr).getTime()) / (24 * 60 * 60 * 1000);
  if (spanDays > MAX_DATE_RANGE_DAYS) {
    throw new AppError(`Search range cannot exceed ${MAX_DATE_RANGE_DAYS} days`, 400);
  }

  const startDate = zonedWallClockToUtc(startDateStr, '00:00', timezone);
  const endDate = zonedWallClockToUtc(endDateStr, '00:00', timezone);

  // Candidate instructors: either just the one requested, or every active instructor
  let candidateInstructors: Array<{ id: string; full_name: string; zip_code: string | null }> = [];
  if (instructorId) {
    const result = await query(
      `SELECT id, full_name, zip_code FROM instructors WHERE id = $1 AND tenant_id = $2`,
      [instructorId, tenantId]
    );
    candidateInstructors = result.rows;
  } else {
    const result = await query(
      `SELECT id, full_name, zip_code FROM instructors WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );
    candidateInstructors = result.rows;
  }

  const failedInstructors: string[] = [];
  const rankedSlots: RankedTimeSlot[] = [];

  if (candidateInstructors.length === 0) {
    return { slots: [], failedInstructors: [] };
  }

  const candidateIds = candidateInstructors.map((i) => i.id);

  // Each candidate's configured service-area zips, batched in one query. An
  // instructor absent from this map has no rows configured, which means
  // "serves everywhere" (Constraint B) - see inArea() below.
  const serviceAreasByInstructor = await getServiceAreasForInstructorsBatch(candidateIds, tenantId);

  const inArea = (instId: string): boolean => {
    const zips = serviceAreasByInstructor.get(instId);
    if (!zips || zips.length === 0) return true;
    return zips.includes(pickupZip);
  };

  // Lessons for all candidate instructors in the search window, used to work
  // out each instructor's "coming from" location for a given slot.
  const lessonsResult = await query(
    `SELECT instructor_id, date, start_time, end_time, pickup_address
     FROM lessons
     WHERE instructor_id = ANY($1) AND tenant_id = $2
     AND date >= $3 AND date <= $4
     AND status NOT IN ('cancelled', 'no_show')`,
    [candidateIds, tenantId, startDateStr, endDateStr]
  );
  const lessonsByInstructorDate = new Map<string, any[]>();
  for (const row of lessonsResult.rows) {
    // Same DATE-column reasoning as findAvailableSlots above - no tenant-zone
    // conversion needed for a value with no time component.
    const dateKey = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
    const key = `${row.instructor_id}|${dateKey}`;
    const existing = lessonsByInstructorDate.get(key) || [];
    existing.push(row);
    lessonsByInstructorDate.set(key, existing);
  }

  // Determine an instructor's starting point (zip) for a given slot: the
  // pickup zip of their most recent lesson that day ending before the slot
  // starts, else their home zip.
  const getInstructorStartingPoint = (
    instId: string,
    slotDate: string,
    slotStartTime: string
  ): { zip: string | null; comingFrom: 'home' | 'lesson' } => {
    const instructor = candidateInstructors.find((i) => i.id === instId);
    const homeZip = instructor?.zip_code || null;

    const slotStartMinutes = timeToMinutes(
      slotStartTime.includes('T')
        ? formatInTenantZone(new Date(slotStartTime), timezone, 'HH:mm')
        : slotStartTime.slice(0, 5)
    );

    // Single linear pass over the shared (unfiltered) array stored in
    // lessonsByInstructorDate - deliberately no .filter()/.sort() here, so
    // this can never mutate the Map's stored arrays no matter how the
    // surrounding code changes later.
    const lessonsOnDate = lessonsByInstructorDate.get(`${instId}|${slotDate}`) || [];

    let mostRecent: (typeof lessonsOnDate)[number] | null = null;
    let mostRecentEndMinutes = -Infinity;
    for (const lesson of lessonsOnDate) {
      if (!lesson.end_time) continue;
      const endMinutes = timeToMinutes(lesson.end_time.slice(0, 5));
      if (endMinutes <= slotStartMinutes && endMinutes > mostRecentEndMinutes) {
        mostRecent = lesson;
        mostRecentEndMinutes = endMinutes;
      }
    }

    if (!mostRecent) {
      return { zip: homeZip, comingFrom: 'home' };
    }

    const previousZip = extractZipCode(mostRecent.pickup_address);

    return { zip: previousZip || homeZip, comingFrom: 'lesson' };
  };

  const filterByTimePreference = (slots: TimeSlot[]): TimeSlot[] => {
    if (!timePreference || timePreference === 'any') return slots;
    return slots.filter((slot) => {
      const hour = slot.startTime.includes('T')
        ? parseInt(formatInTenantZone(new Date(slot.startTime), timezone, 'HH'), 10)
        : parseInt(slot.startTime.split(':')[0], 10);
      switch (timePreference) {
        case 'morning':
          return hour >= 6 && hour < 12;
        case 'afternoon':
          return hour >= 12 && hour < 17;
        case 'evening':
          return hour >= 17 && hour < 21;
        default:
          return true;
      }
    });
  };

  for (const instructor of candidateInstructors) {
    try {
      const slots = await findAvailableSlots({
        tenantId,
        instructorId: instructor.id,
        startDate,
        endDate,
        duration,
        studentId,
        timezone,
      });

      const filteredSlots = filterByTimePreference(slots);

      for (const slot of filteredSlots) {
        const { zip, comingFrom } = getInstructorStartingPoint(instructor.id, slot.date, slot.startTime);
        const proximityScore = calculateProximityScore(zip, pickupZip);

        rankedSlots.push({
          ...slot,
          proximityScore,
          instructorName: instructor.full_name,
          instructorZip: zip,
          comingFrom,
          outsideServiceArea: !inArea(instructor.id),
        });
      }
    } catch (err) {
      failedInstructors.push(instructor.id);
    }
  }

  // Service area is a ranking signal, never a filter (Constraint A: this is
  // the only place area membership affects the result - no second search
  // path). A previous version filtered to in-area slots and fell back to
  // everyone only when that set was completely empty - but an unconfigured
  // instructor always counts as in-area (Constraint B), so a single
  // unconfigured candidate kept the filtered set non-empty forever, and any
  // instructor who DID configure a service area could be silently excluded
  // from every search, even as the closest match. All slots are always
  // returned now; in-area slots simply sort above out-of-area ones, and
  // proximity-then-date ordering is preserved within each group.
  rankedSlots.sort((a, b) => {
    if (a.outsideServiceArea !== b.outsideServiceArea) {
      return a.outsideServiceArea ? 1 : -1;
    }
    if (b.proximityScore !== a.proximityScore) {
      return b.proximityScore - a.proximityScore;
    }
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return { slots: rankedSlots, failedInstructors };
};

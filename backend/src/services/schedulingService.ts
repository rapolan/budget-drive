/**
 * Scheduling Service
 * Smart scheduling logic: find available slots, detect conflicts, validate bookings
 */

import { query } from '../config/database';
import { TimeSlot, SchedulingConflict, AvailabilityRequest } from '../types';
import { getSchedulingSettings } from './availabilityService';

// Helper function to parse time string to minutes since midnight
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper function to get day of week from date (0 = Sunday, 6 = Saturday)
const getDayOfWeek = (date: Date): number => {
  return date.getDay();
};

// Helper function to format date as YYYY-MM-DD (using local timezone)
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const { tenantId, instructorId, vehicleId, startDate, endDate, duration, studentId } = request;

  const settings = await getSchedulingSettings(tenantId);
  const bufferTime = settings.bufferTimeBetweenLessons;
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

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
    const dateKey = row.date instanceof Date ? formatDate(row.date) : String(row.date).split('T')[0];
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
      const dateKey = row.date instanceof Date ? formatDate(row.date) : String(row.date).split('T')[0];
      const existing = studentLessonsByDate.get(dateKey) || [];
      existing.push(row);
      studentLessonsByDate.set(dateKey, existing);
    }
  }

  const availableSlots: TimeSlot[] = [];
  const vehicleForLesson: string | null = vehicleId || null;

  // Everything below is computed in memory - no further queries.
  const currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    const dayOfWeek = getDayOfWeek(currentDate);
    const dateStr = formatDate(currentDate);

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
          const slotStart = new Date(currentDate);
          slotStart.setHours(Math.floor(slot.start / 60), slot.start % 60, 0, 0);

          const slotEnd = new Date(currentDate);
          slotEnd.setHours(Math.floor(slot.end / 60), slot.end % 60, 0, 0);

          availableSlots.push({
            date: dateStr,
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            instructorId: instId,
            vehicleId: vehicleForLesson ?? null,
            duration,
            available: true,
            reason: undefined,
          });
        }
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
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

  // Generate the theoretical slots for the block (based on capacity, capped
  // to the block's own end_time)
  const theoreticalSlots: Array<{ start: number; end: number }> = [];
  let currentTime = blockStart;

  for (let i = 0; i < maxSlots; i++) {
    const slotStart = currentTime;
    const slotEnd = currentTime + duration;

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
  const settings = await getSchedulingSettings(tenantId);

  const dateStr = formatDate(startTime);
  const dayOfWeek = getDayOfWeek(startTime);
  const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
  const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
  const startTimeStr = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}:00`;
  const endTimeStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}:00`;

  // 1. Check if instructor has availability on this day/time
  const availabilityResult = await query(
    `SELECT * FROM instructor_availability
     WHERE instructor_id = $1 AND tenant_id = $2 AND day_of_week = $3 AND is_active = true
     AND start_time <= $4 AND end_time >= $5`,
    [instructorId, tenantId, dayOfWeek, startTimeStr, endTimeStr]
  );

  if (availabilityResult.rows.length === 0) {
    conflicts.push({
      type: 'outside_working_hours',
      message: 'Instructor is not available during this time',
    });
  }

  // 2. Check capacity: instructor's non-cancelled lesson count for this day
  // against max_students (this availability block's override, else tenant default)
  const maxStudentsForDay =
    availabilityResult.rows[0]?.max_students ?? settings.defaultMaxStudentsPerDay;

  const dailyLessonCountResult = await query(
    `SELECT COUNT(*) FROM lessons
     WHERE instructor_id = $1 AND tenant_id = $2 AND date = $3
     AND status NOT IN ('cancelled', 'no_show')`,
    [instructorId, tenantId, dateStr]
  );

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
    beforeBufferStart.toTimeString().split(' ')[0],
    startTimeStr,
    endTimeStr,
    afterBufferEnd.toTimeString().split(' ')[0],
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

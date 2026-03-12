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
 * Find available time slots for scheduling lessons
 */
export const findAvailableSlots = async (
  request: AvailabilityRequest
): Promise<TimeSlot[]> => {
  const { tenantId, instructorId, vehicleId, startDate, endDate, duration } = request;

  // Get scheduling settings
  const settings = await getSchedulingSettings(tenantId);
  const bufferTime = settings.bufferTimeBetweenLessons;

  const availableSlots: TimeSlot[] = [];

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

  // Iterate through each day in the date range
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    const dayOfWeek = getDayOfWeek(currentDate);
    const dateStr = formatDate(currentDate);

    // Check each instructor
    for (const instId of instructorsToCheck) {
      // Get instructor's capacity and availability for this day of week
      const instructorResult = await query(
        `SELECT ia.start_time, ia.max_students
         FROM instructor_availability ia
         WHERE ia.instructor_id = $1 AND ia.tenant_id = $2 AND ia.day_of_week = $3 AND ia.is_active = true
         ORDER BY ia.start_time
         LIMIT 1`,
        [instId, tenantId, dayOfWeek]
      );

      if (instructorResult.rows.length === 0) {
        continue; // Instructor doesn't work on this day
      }

      const instructorData = instructorResult.rows[0];
      const blockStart = timeToMinutes(instructorData.start_time);

      // Determine max students per day (availability record override or tenant default)
      // Note: max_students on instructor_availability can be null to use tenant default
      const maxSlotsPerDay = instructorData.max_students ?? settings.defaultMaxStudentsPerDay;

      // Check for time off
      const timeOffResult = await query(
        `SELECT * FROM instructor_time_off
         WHERE instructor_id = $1 AND tenant_id = $2
         AND start_date <= $3 AND end_date >= $3
         AND is_approved = true`,
        [instId, tenantId, dateStr]
      );

      if (timeOffResult.rows.length > 0) {
        continue; // Instructor has time off on this day
      }

      // Get existing lessons for this instructor on this day
      const lessonsResult = await query(
        `SELECT date, start_time, end_time
         FROM lessons
         WHERE instructor_id = $1 AND tenant_id = $2
         AND date = $3
         AND status NOT IN ('cancelled', 'no_show')
         ORDER BY start_time`,
        [instId, tenantId, dateStr]
      );

      const existingLessons = lessonsResult.rows;

      // Vehicle ID is provided via request parameter or can be null
      let vehicleForLesson: string | null = vehicleId || null;

      // Generate capacity-based slots
      const slots = findSlotsInBlock(
        blockStart,
        maxSlotsPerDay,
        existingLessons,
        duration,
        bufferTime
      );

      // Create TimeSlot objects
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

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return availableSlots;
};

/**
 * Find free slots within a time block using capacity-based scheduling
 * Generates ONLY the exact number of slots needed based on max_students_per_day
 *
 * @param blockStart - Instructor's start time in minutes since midnight
 * @param maxSlots - Maximum number of students per day (from settings or instructor override)
 * @param existingLessons - Already booked lessons for this day
 * @param duration - Lesson duration in minutes (e.g., 120 for 2 hours)
 * @param bufferTime - Buffer time between lessons in minutes (e.g., 30)
 * @returns Array of available time slots
 *
 * Example: blockStart=540 (9am), maxSlots=3, duration=120, buffer=30
 * Generates exactly 3 slots:
 *   Slot 1: 9:00-11:00 (540-660)
 *   Slot 2: 11:30-1:30 (690-810)
 *   Slot 3: 2:00-4:00 (840-960)
 */
function findSlotsInBlock(
  blockStart: number,
  maxSlots: number,
  existingLessons: any[],
  duration: number,
  bufferTime: number
): Array<{ start: number; end: number }> {
  const slots: Array<{ start: number; end: number }> = [];

  // Generate the theoretical slots for the day (based on capacity, not time range)
  const theoreticalSlots: Array<{ start: number; end: number }> = [];
  let currentTime = blockStart;

  for (let i = 0; i < maxSlots; i++) {
    const slotStart = currentTime;
    const slotEnd = currentTime + duration;

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

  // 2. Check for instructor time off
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

  // 3. Check for overlapping lessons for instructor
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

  // 4. Check for buffer time violations
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

  // 5. Check vehicle availability (if vehicle is school-owned)
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

  // 6. Check for student conflicts (optional - if we want to prevent double-booking students)
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

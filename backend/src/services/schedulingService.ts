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

// Helper function to format date as YYYY-MM-DD
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
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
      // Get instructor's availability for this day of week
      const availabilityResult = await query(
        `SELECT * FROM instructor_availability
         WHERE instructor_id = $1 AND tenant_id = $2 AND day_of_week = $3 AND is_active = true
         ORDER BY start_time`,
        [instId, tenantId, dayOfWeek]
      );

      if (availabilityResult.rows.length === 0) {
        continue; // Instructor doesn't work on this day
      }

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
        `SELECT date, start_time, end_time, buffer_time_after
         FROM lessons
         WHERE instructor_id = $1 AND tenant_id = $2
         AND date = $3
         AND status NOT IN ('cancelled', 'no_show')
         ORDER BY start_time`,
        [instId, tenantId, dateStr]
      );

      const existingLessons = lessonsResult.rows;

      // Get vehicle for this instructor (if they use their own)
      let vehicleForLesson: string | null = vehicleId || null;
      if (!vehicleId) {
        const instructorVehicleResult = await query(
          `SELECT default_vehicle_id, prefers_own_vehicle FROM instructors WHERE id = $1`,
          [instId]
        );
        if (instructorVehicleResult.rows.length > 0) {
          const inst = instructorVehicleResult.rows[0];
          if (inst.prefers_own_vehicle && inst.default_vehicle_id) {
            vehicleForLesson = inst.default_vehicle_id;
          }
        }
      }

      // For each availability block, find free slots
      for (const availBlock of availabilityResult.rows) {
        const blockStart = timeToMinutes(availBlock.start_time);
        const blockEnd = timeToMinutes(availBlock.end_time);

        // Find gaps between existing lessons
        const slots = findSlotsInBlock(
          blockStart,
          blockEnd,
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
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            instructorId: instId,
            vehicleId: vehicleForLesson ?? null,
            duration,
          });
        }
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return availableSlots;
};

/**
 * Find free slots within a time block, considering existing lessons
 */
function findSlotsInBlock(
  blockStart: number,
  blockEnd: number,
  existingLessons: any[],
  duration: number,
  bufferTime: number
): Array<{ start: number; end: number }> {
  const slots: Array<{ start: number; end: number }> = [];

  if (existingLessons.length === 0) {
    // No existing lessons - entire block is available
    if (blockEnd - blockStart >= duration) {
      slots.push({ start: blockStart, end: blockStart + duration });
    }
    return slots;
  }

  let currentTime = blockStart;

  // Check gaps between lessons
  for (const lesson of existingLessons) {
    const lessonStart = timeToMinutes(lesson.start_time);
    const lessonEnd = timeToMinutes(lesson.end_time);
    const lessonBuffer = lesson.buffer_time_after || bufferTime;

    // Check if there's a slot before this lesson
    if (lessonStart - currentTime >= duration) {
      slots.push({ start: currentTime, end: currentTime + duration });
    }

    // Move current time past this lesson and its buffer
    currentTime = lessonEnd + lessonBuffer;
  }

  // Check if there's a slot after the last lesson
  if (blockEnd - currentTime >= duration) {
    slots.push({ start: currentTime, end: currentTime + duration });
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
      `SELECT ownership_type, instructor_id FROM vehicles WHERE id = $1 AND tenant_id = $2`,
      [vehicleId, tenantId]
    );

    if (vehicleCheck.rows.length > 0) {
      const vehicle = vehicleCheck.rows[0];

      // Only check availability for school-owned vehicles
      if (vehicle.ownership_type === 'school_owned' || !vehicle.instructor_id) {
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

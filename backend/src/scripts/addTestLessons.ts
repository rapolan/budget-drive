/**
 * Script to add test lessons for dashboard testing
 * Creates lessons for the current week to test the dashboard view
 */

import { query } from '../config/database';

async function addTestLessons() {
  try {
    console.log('Adding test lessons for dashboard...');

    // Get existing students and instructors
    const studentsResult = await query('SELECT id FROM students LIMIT 10');
    const instructorsResult = await query('SELECT id FROM instructors LIMIT 5');
    const vehiclesResult = await query('SELECT id FROM vehicles LIMIT 3');

    const students = studentsResult.rows;
    const instructors = instructorsResult.rows;
    const vehicles = vehiclesResult.rows;

    if (students.length === 0 || instructors.length === 0) {
      console.log('Not enough students or instructors. Please add some first.');
      process.exit(1);
    }

    const today = new Date();
    const lessons = [];

    // Create lessons for the next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const lessonDate = new Date(today);
      lessonDate.setDate(today.getDate() + dayOffset);

      // Number of lessons per day (more on weekdays, less on weekends)
      const isWeekend = lessonDate.getDay() === 0 || lessonDate.getDay() === 6;
      const lessonsPerDay = isWeekend ? 2 : 5;

      // Time slots for lessons
      const timeSlots = [
        { start: '09:00:00', end: '10:30:00' },
        { start: '11:00:00', end: '12:30:00' },
        { start: '13:00:00', end: '14:30:00' },
        { start: '15:00:00', end: '16:30:00' },
        { start: '17:00:00', end: '18:30:00' },
      ];

      for (let i = 0; i < lessonsPerDay; i++) {
        const student = students[Math.floor(Math.random() * students.length)];
        const instructor = instructors[Math.floor(Math.random() * instructors.length)];
        const vehicle = vehicles.length > 0 ? vehicles[Math.floor(Math.random() * vehicles.length)] : null;
        const slot = timeSlots[i];

        lessons.push({
          date: lessonDate.toISOString().split('T')[0],
          studentId: student.id,
          instructorId: instructor.id,
          vehicleId: vehicle?.id || null,
          startTime: slot.start,
          endTime: slot.end,
          duration: 1.5,
          lessonType: 'behind_wheel',
          cost: 50,
          status: 'scheduled',
        });
      }
    }

    console.log(`Creating ${lessons.length} test lessons...`);

    // Insert lessons
    for (const lesson of lessons) {
      await query(
        `INSERT INTO lessons (
          tenant_id,
          student_id,
          instructor_id,
          vehicle_id,
          date,
          start_time,
          end_time,
          duration,
          lesson_type,
          cost,
          status,
          completion_verified
        ) VALUES (
          (SELECT tenant_id FROM students WHERE id = $1 LIMIT 1),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false
        )`,
        [
          lesson.studentId,
          lesson.instructorId,
          lesson.vehicleId,
          lesson.date,
          lesson.startTime,
          lesson.endTime,
          lesson.duration,
          lesson.lessonType,
          lesson.cost,
          lesson.status,
        ]
      );
    }

    console.log('✓ Successfully added test lessons!');
    console.log(`  - Total lessons created: ${lessons.length}`);
    console.log(`  - Date range: ${lessons[0].date} to ${lessons[lessons.length - 1].date}`);

    // Show breakdown by day
    const byDay = lessons.reduce((acc, lesson) => {
      const date = new Date(lesson.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      acc[dayName] = (acc[dayName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\nLessons per day:');
    Object.entries(byDay).forEach(([day, count]) => {
      console.log(`  - ${day}: ${count} lessons`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Failed to add test lessons:', error);
    process.exit(1);
  }
}

addTestLessons();

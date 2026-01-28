const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function testSmartBooking() {
  const client = await pool.connect();
  try {
    console.log('🔍 Testing Smart Booking Prerequisites...\n');

    // 1. Check instructors
    console.log('1️⃣ Checking instructors...');
    const instructorsResult = await client.query(`
      SELECT id, full_name, status
      FROM instructors
      LIMIT 5
    `);
    console.log(`✅ Found ${instructorsResult.rows.length} instructors`);
    instructorsResult.rows.forEach((instructor, idx) => {
      console.log(`   ${idx + 1}. ${instructor.full_name} (${instructor.status})`);
    });
    console.log('');

    // 2. Check instructor availability
    console.log('2️⃣ Checking instructor availability settings...');
    const availabilityResult = await client.query(`
      SELECT
        ia.id,
        i.full_name as instructor_name,
        ia.day_of_week,
        ia.start_time,
        ia.end_time,
        ia.max_students,
        ia.is_active
      FROM instructor_availability ia
      JOIN instructors i ON ia.instructor_id = i.id
      ORDER BY i.full_name, ia.day_of_week
    `);

    if (availabilityResult.rows.length === 0) {
      console.log('❌ NO AVAILABILITY RECORDS FOUND!');
      console.log('   This is why no time slots are showing up.');
      console.log('   Instructors need availability records to generate time slots.\n');
    } else {
      console.log(`✅ Found ${availabilityResult.rows.length} availability records`);

      // Group by instructor
      const byInstructor = availabilityResult.rows.reduce((acc, row) => {
        if (!acc[row.instructor_name]) acc[row.instructor_name] = [];
        acc[row.instructor_name].push(row);
        return acc;
      }, {});

      Object.entries(byInstructor).forEach(([name, records]) => {
        console.log(`\n   📅 ${name}:`);
        records.forEach(r => {
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          console.log(`      - ${days[r.day_of_week]}: ${r.start_time}-${r.end_time} (max: ${r.max_students || 'default'}, active: ${r.is_active})`);
        });
      });
      console.log('');
    }

    // 3. Check scheduling settings
    console.log('3️⃣ Checking scheduling settings...');
    const settingsResult = await client.query(`
      SELECT
        default_lesson_duration,
        buffer_time_between_lessons,
        default_max_students_per_day
      FROM scheduling_settings
      LIMIT 1
    `);

    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      console.log('✅ Scheduling settings found:');
      console.log(`   - Default lesson duration: ${settings.default_lesson_duration} minutes`);
      console.log(`   - Buffer time: ${settings.buffer_time_between_lessons} minutes`);
      console.log(`   - Default max students/day: ${settings.default_max_students_per_day}`);
    } else {
      console.log('❌ No scheduling settings found');
    }
    console.log('');

    // 4. Check students
    console.log('4️⃣ Checking students...');
    const studentsResult = await client.query(`
      SELECT COUNT(*) as count FROM students
    `);
    console.log(`✅ Found ${studentsResult.rows[0].count} students\n`);

    // Summary
    console.log('📊 DIAGNOSIS:');
    console.log('─'.repeat(50));

    if (availabilityResult.rows.length === 0) {
      console.log('❌ ROOT CAUSE: No instructor availability records exist');
      console.log('');
      console.log('🔧 SOLUTION:');
      console.log('   1. Go to the Scheduling page in the app');
      console.log('   2. Click on an instructor to view their profile');
      console.log('   3. Go to the "Availability" tab');
      console.log('   4. Add availability by selecting days and time ranges');
      console.log('   5. Click save');
      console.log('');
      console.log('   OR use the AvailabilityEditor component to set up');
      console.log('   instructor availability for each day of the week.');
      console.log('');
      console.log('   Example: Set Mon-Fri 9:00 AM - 5:00 PM for an instructor');
      console.log('');
      console.log('   Once availability is set, the smart booking will show');
      console.log('   available time slots based on:');
      console.log('   - Instructor availability hours');
      console.log('   - Max students per day capacity');
      console.log('   - Buffer time between lessons');
      console.log('   - Existing lesson conflicts');
    } else {
      console.log('✅ System is configured correctly!');
      console.log('');
      console.log('   If slots still not showing:');
      console.log('   - Check that instructors have is_active = true');
      console.log('   - Verify date range covers availability days');
      console.log('   - Check browser console for API errors');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testSmartBooking();

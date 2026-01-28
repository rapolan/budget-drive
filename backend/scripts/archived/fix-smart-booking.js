const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function fixSmartBooking() {
  const client = await pool.connect();
  try {
    console.log('🔧 Fixing Smart Booking System...\n');

    // 1. Check if default_max_students_per_day column exists in scheduling_settings
    console.log('1️⃣ Checking scheduling_settings table...');
    const settingsCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'scheduling_settings'
      AND column_name = 'default_max_students_per_day'
    `);

    if (settingsCheck.rows.length === 0) {
      console.log('   ⚠️  Column default_max_students_per_day missing. Adding it...');
      await client.query(`
        ALTER TABLE scheduling_settings
        ADD COLUMN IF NOT EXISTS default_max_students_per_day INTEGER DEFAULT 3
        CHECK (default_max_students_per_day > 0 AND default_max_students_per_day <= 20)
      `);
      console.log('   ✅ Column added');
    } else {
      console.log('   ✅ Column exists');
    }

    // 2. Ensure scheduling_settings has a row
    console.log('\n2️⃣ Checking if scheduling_settings has data...');
    const settingsData = await client.query(`SELECT * FROM scheduling_settings LIMIT 1`);

    if (settingsData.rows.length === 0) {
      console.log('   ⚠️  No settings found. Creating default settings...');

      // Get tenant ID
      const tenantResult = await client.query(`SELECT id FROM tenants LIMIT 1`);
      if (tenantResult.rows.length === 0) {
        console.log('   ❌ No tenant found. Cannot create settings.');
      } else {
        const tenantId = tenantResult.rows[0].id;
        await client.query(`
          INSERT INTO scheduling_settings (
            tenant_id,
            default_lesson_duration,
            buffer_time_between_lessons,
            default_max_students_per_day
          ) VALUES ($1, 120, 30, 3)
        `, [tenantId]);
        console.log('   ✅ Default settings created (2hr lessons, 30min buffer, 3 students/day)');
      }
    } else {
      const settings = settingsData.rows[0];
      console.log('   ✅ Settings exist:');
      console.log(`      - Lesson duration: ${settings.default_lesson_duration} min`);
      console.log(`      - Buffer time: ${settings.buffer_time_between_lessons} min`);
      console.log(`      - Max students/day: ${settings.default_max_students_per_day || 3}`);
    }

    // 3. Verify instructor_availability records exist
    console.log('\n3️⃣ Checking instructor availability...');
    const availCount = await client.query(`
      SELECT COUNT(*) as count
      FROM instructor_availability
      WHERE is_active = true
    `);
    console.log(`   ✅ Found ${availCount.rows[0].count} active availability records`);

    if (availCount.rows[0].count === 0) {
      console.log('   ⚠️  WARNING: No active availability records found!');
      console.log('      Instructors need availability set to show time slots.');
      console.log('      Go to Scheduling → Select Instructor → Availability tab');
    }

    // 4. Check instructor_time_off table exists
    console.log('\n4️⃣ Checking instructor_time_off table...');
    const timeOffTableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'instructor_time_off'
    `);

    if (timeOffTableCheck.rows.length === 0) {
      console.log('   ❌ instructor_time_off table does not exist!');
      console.log('      This should have been created. Please check migrations.');
    } else {
      console.log('   ✅ instructor_time_off table exists');
    }

    // 5. Test the fixed query
    console.log('\n5️⃣ Testing slot generation query...');
    const testResult = await client.query(`
      SELECT
        i.id,
        i.full_name,
        ia.day_of_week,
        ia.start_time,
        ia.max_students,
        i.prefers_own_vehicle,
        i.default_vehicle_id
      FROM instructor_availability ia
      JOIN instructors i ON i.id = ia.instructor_id
      WHERE ia.is_active = true
      LIMIT 3
    `);

    if (testResult.rows.length > 0) {
      console.log('   ✅ Query works! Sample results:');
      testResult.rows.forEach((row, idx) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        console.log(`      ${idx + 1}. ${row.full_name} - ${days[row.day_of_week]} at ${row.start_time} (max: ${row.max_students || 'default'})`);
      });
    } else {
      console.log('   ⚠️  Query returned no results');
    }

    console.log('\n📊 SUMMARY:');
    console.log('─'.repeat(60));
    console.log('✅ Smart booking system should now be working!');
    console.log('');
    console.log('🧪 To test:');
    console.log('   1. Restart the backend server (the code was updated)');
    console.log('   2. Open the app → Lessons → Book Lesson');
    console.log('   3. Select a student and instructor');
    console.log('   4. Click "Find Available Times"');
    console.log('   5. You should see time slots appear');
    console.log('');
    console.log('If you still have issues:');
    console.log('   - Check browser console for errors');
    console.log('   - Check backend logs for database errors');
    console.log('   - Verify instructors have availability set (Scheduling page)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixSmartBooking();

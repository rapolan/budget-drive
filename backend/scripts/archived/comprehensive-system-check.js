const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function comprehensiveCheck() {
  const client = await pool.connect();
  try {
    console.log('🔍 COMPREHENSIVE SYSTEM CHECK\n');
    console.log('='.repeat(70));

    // 1. Check all critical tables exist
    console.log('\n1️⃣ DATABASE TABLES');
    console.log('-'.repeat(70));

    const criticalTables = [
      'tenants',
      'students',
      'instructors',
      'vehicles',
      'lessons',
      'payments',
      'instructor_availability',
      'instructor_time_off',
      'scheduling_settings',
      'recurring_patterns',
      'notifications'
    ];

    for (const tableName of criticalTables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        )
      `, [tableName]);

      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${tableName}`);
    }

    // 2. Check for common missing columns that might cause issues
    console.log('\n2️⃣ CRITICAL COLUMNS');
    console.log('-'.repeat(70));

    const columnChecks = [
      { table: 'scheduling_settings', column: 'default_lesson_duration' },
      { table: 'scheduling_settings', column: 'buffer_time_between_lessons' },
      { table: 'scheduling_settings', column: 'default_max_students_per_day' },
      { table: 'instructor_availability', column: 'max_students' },
      { table: 'instructor_availability', column: 'is_active' },
      { table: 'instructors', column: 'calendar_feed_token' },
      { table: 'instructor_time_off', column: 'is_approved' },
      { table: 'students', column: 'zip_code' },
      { table: 'lessons', column: 'pickup_address' },
      { table: 'lessons', column: 'lesson_number' },
    ];

    for (const { table, column } of columnChecks) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2
        )
      `, [table, column]);

      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${table}.${column}`);
    }

    // 3. Check data integrity
    console.log('\n3️⃣ DATA INTEGRITY');
    console.log('-'.repeat(70));

    // Check if we have at least one tenant
    const tenantCount = await client.query('SELECT COUNT(*) FROM tenants');
    console.log(`   ${tenantCount.rows[0].count > 0 ? '✅' : '❌'} Tenants: ${tenantCount.rows[0].count}`);

    // Check if we have students
    const studentCount = await client.query('SELECT COUNT(*) FROM students');
    console.log(`   ${studentCount.rows[0].count > 0 ? '✅' : '⚠️ '} Students: ${studentCount.rows[0].count}`);

    // Check if we have instructors
    const instructorCount = await client.query('SELECT COUNT(*) FROM instructors');
    console.log(`   ${instructorCount.rows[0].count > 0 ? '✅' : '❌'} Instructors: ${instructorCount.rows[0].count}`);

    // Check if we have scheduling settings
    const settingsCount = await client.query('SELECT COUNT(*) FROM scheduling_settings');
    console.log(`   ${settingsCount.rows[0].count > 0 ? '✅' : '❌'} Scheduling Settings: ${settingsCount.rows[0].count}`);

    // Check instructor availability
    const availCount = await client.query('SELECT COUNT(*) FROM instructor_availability WHERE is_active = true');
    console.log(`   ${availCount.rows[0].count > 0 ? '✅' : '❌'} Active Availability Slots: ${availCount.rows[0].count}`);

    // 4. Test critical queries
    console.log('\n4️⃣ CRITICAL QUERY TESTS');
    console.log('-'.repeat(70));

    // Test 1: Smart booking slot generation query
    try {
      await client.query(`
        SELECT ia.start_time, ia.max_students
        FROM instructor_availability ia
        WHERE ia.is_active = true
        LIMIT 1
      `);
      console.log('   ✅ Smart booking query (instructor_availability)');
    } catch (err) {
      console.log('   ❌ Smart booking query:', err.message);
    }

    // Test 2: Scheduling settings query
    try {
      const settings = await client.query(`
        SELECT default_lesson_duration, buffer_time_between_lessons, default_max_students_per_day
        FROM scheduling_settings
        LIMIT 1
      `);
      if (settings.rows.length > 0) {
        console.log('   ✅ Scheduling settings query');
        console.log(`      Duration: ${settings.rows[0].default_lesson_duration}min, Buffer: ${settings.rows[0].buffer_time_between_lessons}min, Max: ${settings.rows[0].default_max_students_per_day}`);
      } else {
        console.log('   ⚠️  Scheduling settings query (no data)');
      }
    } catch (err) {
      console.log('   ❌ Scheduling settings query:', err.message);
    }

    // Test 3: Time off query
    try {
      await client.query(`
        SELECT * FROM instructor_time_off
        WHERE is_approved = true
        LIMIT 1
      `);
      console.log('   ✅ Time off query');
    } catch (err) {
      console.log('   ❌ Time off query:', err.message);
    }

    // Test 4: Calendar feed token query
    try {
      await client.query(`
        SELECT id, full_name, calendar_feed_token
        FROM instructors
        WHERE calendar_feed_token IS NOT NULL
        LIMIT 1
      `);
      console.log('   ✅ Calendar feed token query');
    } catch (err) {
      console.log('   ❌ Calendar feed token query:', err.message);
    }

    // Test 5: Lesson with pickup address
    try {
      await client.query(`
        SELECT id, pickup_address, lesson_number
        FROM lessons
        LIMIT 1
      `);
      console.log('   ✅ Lesson query (pickup_address, lesson_number)');
    } catch (err) {
      console.log('   ❌ Lesson query:', err.message);
    }

    // 5. Check for orphaned records
    console.log('\n5️⃣ DATA CONSISTENCY');
    console.log('-'.repeat(70));

    // Instructors without availability
    const noAvail = await client.query(`
      SELECT COUNT(DISTINCT i.id) as count
      FROM instructors i
      LEFT JOIN instructor_availability ia ON i.id = ia.instructor_id
      WHERE ia.id IS NULL AND i.status = 'active'
    `);
    if (noAvail.rows[0].count > 0) {
      console.log(`   ⚠️  ${noAvail.rows[0].count} active instructors without availability`);
    } else {
      console.log('   ✅ All active instructors have availability');
    }

    // Students without zip code
    const noZip = await client.query(`
      SELECT COUNT(*) as count
      FROM students
      WHERE zip_code IS NULL OR zip_code = ''
    `);
    if (noZip.rows[0].count > 0) {
      console.log(`   ⚠️  ${noZip.rows[0].count} students without zip code (affects proximity matching)`);
    } else {
      console.log('   ✅ All students have zip codes');
    }

    // 6. System Readiness
    console.log('\n6️⃣ SYSTEM READINESS');
    console.log('-'.repeat(70));

    let issues = 0;

    if (tenantCount.rows[0].count === 0) {
      console.log('   ❌ No tenants - system cannot function');
      issues++;
    }

    if (instructorCount.rows[0].count === 0) {
      console.log('   ❌ No instructors - cannot book lessons');
      issues++;
    }

    if (settingsCount.rows[0].count === 0) {
      console.log('   ❌ No scheduling settings - smart booking will fail');
      issues++;
    }

    if (availCount.rows[0].count === 0) {
      console.log('   ❌ No instructor availability - smart booking will show no slots');
      issues++;
    }

    if (issues === 0) {
      console.log('   ✅ System is ready for operation!');
    }

    // Final Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));

    if (issues === 0) {
      console.log('✅ System check passed! All critical components are functional.');
      console.log('');
      console.log('You can now:');
      console.log('  • Book lessons using smart booking');
      console.log('  • Manage instructor availability');
      console.log('  • Request and approve time off');
      console.log('  • Subscribe to calendar feeds');
    } else {
      console.log(`❌ Found ${issues} critical issues that need to be resolved.`);
    }

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

comprehensiveCheck();

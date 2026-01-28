const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function testCalendarFeed() {
  const client = await pool.connect();
  try {
    console.log('🔍 Testing Calendar Feed System...\n');

    // 1. Check if calendar_feed_token column exists
    console.log('1️⃣ Checking if calendar_feed_token column exists...');
    const columnCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'instructors' AND column_name = 'calendar_feed_token'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✅ calendar_feed_token column exists');
      console.log(`   Type: ${columnCheck.rows[0].data_type}`);
      console.log(`   Nullable: ${columnCheck.rows[0].is_nullable}\n`);
    } else {
      console.log('❌ calendar_feed_token column does NOT exist\n');
      return;
    }

    // 2. Check if there are any instructors
    console.log('2️⃣ Checking for instructors...');
    const instructorsResult = await client.query(`
      SELECT id, full_name, calendar_feed_token
      FROM instructors
      LIMIT 5
    `);

    console.log(`✅ Found ${instructorsResult.rows.length} instructors`);
    if (instructorsResult.rows.length > 0) {
      instructorsResult.rows.forEach((instructor, idx) => {
        console.log(`   ${idx + 1}. ${instructor.full_name} (${instructor.id})`);
        console.log(`      Token: ${instructor.calendar_feed_token || 'Not set'}`);
      });
      console.log('');
    }

    // 3. Check if there are any lessons
    console.log('3️⃣ Checking for lessons...');
    const lessonsResult = await client.query(`
      SELECT
        l.id,
        l.date,
        l.start_time,
        l.end_time,
        l.status,
        i.full_name as instructor_name,
        s.full_name as student_name
      FROM lessons l
      JOIN instructors i ON l.instructor_id = i.id
      JOIN students s ON l.student_id = s.id
      WHERE l.date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY l.date DESC
      LIMIT 5
    `);

    console.log(`✅ Found ${lessonsResult.rows.length} recent/upcoming lessons`);
    if (lessonsResult.rows.length > 0) {
      lessonsResult.rows.forEach((lesson, idx) => {
        console.log(`   ${idx + 1}. ${lesson.date.toISOString().split('T')[0]} ${lesson.start_time}-${lesson.end_time}`);
        console.log(`      Instructor: ${lesson.instructor_name}`);
        console.log(`      Student: ${lesson.student_name}`);
        console.log(`      Status: ${lesson.status}`);
      });
      console.log('');
    }

    // 4. Test summary
    console.log('📊 Summary:');
    console.log('   ✅ Database column exists');
    console.log(`   ${instructorsResult.rows.length > 0 ? '✅' : '⚠️'} Instructors available: ${instructorsResult.rows.length}`);
    console.log(`   ${lessonsResult.rows.length > 0 ? '✅' : '⚠️'} Lessons available: ${lessonsResult.rows.length}`);

    const tokensSet = instructorsResult.rows.filter(i => i.calendar_feed_token).length;
    console.log(`   ${tokensSet > 0 ? '✅' : '⚠️'} Calendar feed tokens set: ${tokensSet}/${instructorsResult.rows.length}`);

    console.log('\n🎯 Next Steps:');
    console.log('   1. Visit the Scheduling page in the app');
    console.log('   2. Click the "Calendar Feed" tab');
    console.log('   3. Click "Enable Calendar Sync" to generate a feed URL');
    console.log('   4. Copy the URL and subscribe to it in your calendar app');
    console.log('   5. Or visit an instructor\'s profile and enable calendar sync there');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testCalendarFeed();

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function checkTableMismatches() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking for Table Naming Mismatches\n');
    console.log('='.repeat(70));

    // Get all actual tables in the database
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const actualTables = tablesResult.rows.map(r => r.table_name);

    console.log('\n📊 Tables in Database:');
    console.log('-'.repeat(70));
    actualTables.forEach(table => {
      console.log(`   ✅ ${table}`);
    });

    // Tables that code might reference but don't exist
    const expectedTables = [
      'recurring_patterns',  // Routes reference this
      'notifications',       // Routes reference this
    ];

    console.log('\n⚠️  Tables Referenced in Code but Missing:');
    console.log('-'.repeat(70));

    let mismatches = 0;
    for (const table of expectedTables) {
      if (!actualTables.includes(table)) {
        console.log(`   ❌ ${table} - NOT FOUND`);

        // Check for similar names
        const similar = actualTables.filter(t =>
          t.includes(table.split('_')[0]) || table.includes(t.split('_')[0])
        );

        if (similar.length > 0) {
          console.log(`      💡 Similar tables found: ${similar.join(', ')}`);
          mismatches++;
        }
      } else {
        console.log(`   ✅ ${table}`);
      }
    }

    // Check for tables with "pattern" in the name
    console.log('\n🔍 Tables with "pattern" in name:');
    console.log('-'.repeat(70));
    const patternTables = actualTables.filter(t => t.includes('pattern'));
    if (patternTables.length > 0) {
      patternTables.forEach(t => console.log(`   • ${t}`));
    } else {
      console.log('   None found');
    }

    // Check for tables with "notification" in the name
    console.log('\n🔍 Tables with "notification" in name:');
    console.log('-'.repeat(70));
    const notificationTables = actualTables.filter(t => t.includes('notification'));
    if (notificationTables.length > 0) {
      notificationTables.forEach(t => console.log(`   • ${t}`));
    } else {
      console.log('   None found');
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));

    if (mismatches > 0) {
      console.log(`❌ Found ${mismatches} table naming mismatches`);
      console.log('');
      console.log('Recommendations:');
      console.log('1. recurring_patterns → recurring_lesson_patterns exists');
      console.log('   • Update routes/services to use recurring_lesson_patterns');
      console.log('   • OR create a view: CREATE VIEW recurring_patterns AS SELECT * FROM recurring_lesson_patterns');
      console.log('');
      console.log('2. notifications → No table exists');
      console.log('   • Create migration for notifications table');
      console.log('   • OR use in-memory notification queue (no table needed)');
    } else {
      console.log('✅ No critical table naming mismatches found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTableMismatches();

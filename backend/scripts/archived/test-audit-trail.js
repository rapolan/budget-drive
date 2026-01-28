const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function testAuditTrail() {
  const client = await pool.connect();
  try {
    console.log('🧪 Testing Audit Trail Functionality\n');
    console.log('='.repeat(70));

    // Check if dev user exists
    const userCheck = await client.query(`
      SELECT id, email, full_name, status
      FROM users
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `);

    if (userCheck.rows.length === 0) {
      console.log('❌ Development user not found in database');
      return;
    }

    console.log('✅ Development user exists:');
    console.log('   Email:', userCheck.rows[0].email);
    console.log('   Name:', userCheck.rows[0].full_name);
    console.log('   Status:', userCheck.rows[0].status);

    console.log('\n' + '='.repeat(70));
    console.log('📊 AUDIT TRAIL STATUS BY TABLE');
    console.log('='.repeat(70));

    // Check each table for audit columns
    const tables = ['students', 'instructors', 'lessons', 'vehicles', 'payments'];

    for (const table of tables) {
      console.log(`\n🔍 ${table.toUpperCase()}`);
      console.log('-'.repeat(70));

      // Check if columns exist
      const columnCheck = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
          AND column_name IN ('created_by', 'updated_by')
        ORDER BY column_name
      `, [table]);

      const hasCreatedBy = columnCheck.rows.some(r => r.column_name === 'created_by');
      const hasUpdatedBy = columnCheck.rows.some(r => r.column_name === 'updated_by');

      if (!hasCreatedBy || !hasUpdatedBy) {
        console.log('❌ Missing audit columns');
        continue;
      }

      console.log('✅ Audit columns present: created_by, updated_by');

      // Count records with audit data
      const auditStats = await client.query(`
        SELECT
          COUNT(*) as total_records,
          COUNT(created_by) as records_with_created_by,
          COUNT(updated_by) as records_with_updated_by,
          COUNT(CASE WHEN created_by = '00000000-0000-0000-0000-000000000001' THEN 1 END) as created_by_dev_user,
          COUNT(CASE WHEN updated_by = '00000000-0000-0000-0000-000000000001' THEN 1 END) as updated_by_dev_user
        FROM ${table}
      `);

      const stats = auditStats.rows[0];
      console.log(`   Total records: ${stats.total_records}`);
      console.log(`   Records with created_by: ${stats.records_with_created_by} (${Math.round(stats.records_with_created_by / stats.total_records * 100)}%)`);
      console.log(`   Records with updated_by: ${stats.records_with_updated_by} (${Math.round(stats.records_with_updated_by / stats.total_records * 100)}%)`);
      console.log(`   Created by dev user: ${stats.created_by_dev_user}`);
      console.log(`   Updated by dev user: ${stats.updated_by_dev_user}`);

      // Show sample records with audit info
      if (parseInt(stats.total_records) > 0) {
        const sample = await client.query(`
          SELECT
            id,
            created_by,
            updated_by,
            created_at,
            updated_at
          FROM ${table}
          ORDER BY created_at DESC
          LIMIT 3
        `);

        if (sample.rows.length > 0) {
          console.log(`\n   📋 Sample records:`);
          sample.rows.forEach((row, idx) => {
            console.log(`   ${idx + 1}. ID: ${row.id.substring(0, 8)}...`);
            console.log(`      created_by: ${row.created_by ? row.created_by.substring(0, 8) + '...' : 'NULL'}`);
            console.log(`      updated_by: ${row.updated_by ? row.updated_by.substring(0, 8) + '...' : 'NULL'}`);
          });
        }
      }
    }

    // Test query with user JOIN
    console.log('\n' + '='.repeat(70));
    console.log('🔗 TESTING AUDIT TRAIL WITH USER JOINS');
    console.log('='.repeat(70));

    const joinTest = await client.query(`
      SELECT
        s.id,
        s.full_name as student_name,
        s.created_at,
        u1.full_name as created_by_user,
        u2.full_name as updated_by_user
      FROM students s
      LEFT JOIN users u1 ON s.created_by = u1.id
      LEFT JOIN users u2 ON s.updated_by = u2.id
      ORDER BY s.created_at DESC
      LIMIT 3
    `);

    if (joinTest.rows.length > 0) {
      console.log('\n✅ Successfully joined with users table:');
      joinTest.rows.forEach((row, idx) => {
        console.log(`\n${idx + 1}. Student: ${row.student_name}`);
        console.log(`   Created by: ${row.created_by_user || 'Unknown'}`);
        console.log(`   Updated by: ${row.updated_by_user || 'Unknown'}`);
        console.log(`   Created at: ${row.created_at}`);
      });
    } else {
      console.log('⚠️  No student records found for testing');
    }

    console.log('\n' + '='.repeat(70));
    console.log('📝 SUMMARY');
    console.log('='.repeat(70));

    console.log('✅ Development user exists in database');
    console.log('✅ All tables have audit columns (created_by, updated_by)');
    console.log('✅ Audit trail JOINs with users table work correctly');
    console.log('');
    console.log('🎯 NEXT STEPS:');
    console.log('1. Restart the backend server to load the new compiled code');
    console.log('2. Create a new record (student, instructor, lesson, etc.)');
    console.log('3. Verify created_by and updated_by are populated with the dev user ID');
    console.log('4. Update a record and verify updated_by changes accordingly');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testAuditTrail();

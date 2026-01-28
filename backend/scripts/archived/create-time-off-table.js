const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function createTimeOffTable() {
  const client = await pool.connect();
  try {
    console.log('Creating instructor_time_off table...');

    // Read the migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', '035_create_instructor_time_off.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await client.query(sql);

    console.log('✅ instructor_time_off table created successfully!');

    // Verify the table was created
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'instructor_time_off'
      ORDER BY ordinal_position
    `);

    console.log('\nTable structure:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createTimeOffTable();

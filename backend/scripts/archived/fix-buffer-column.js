const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'budget_driving_app',
  port: 5432,
  password: '', // No password for local postgres
});

async function addBufferColumn() {
  const client = await pool.connect();
  try {
    console.log('Adding buffer_time_between_lessons column...');

    await client.query(`
      ALTER TABLE scheduling_settings
      ADD COLUMN IF NOT EXISTS buffer_time_between_lessons INTEGER DEFAULT 30
    `);

    console.log('Column added successfully!');

    await client.query(`
      UPDATE scheduling_settings
      SET buffer_time_between_lessons = 30
      WHERE buffer_time_between_lessons IS NULL
    `);

    console.log('Updated existing rows!');
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addBufferColumn();

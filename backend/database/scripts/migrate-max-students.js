/**
 * Quick migration for max_students column
 */

const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Add max_students column
    await client.query(`
      ALTER TABLE instructor_availability 
      ADD COLUMN IF NOT EXISTS max_students INTEGER DEFAULT NULL
    `);
    console.log('✅ Added max_students column');

    // Try to add constraint (may fail if it exists)
    try {
      await client.query(`
        ALTER TABLE instructor_availability
        ADD CONSTRAINT check_max_students_range 
        CHECK (max_students IS NULL OR (max_students >= 1 AND max_students <= 10))
      `);
      console.log('✅ Added constraint');
    } catch (e) {
      if (e.code === '42710') {
        console.log('⚠️ Constraint already exists, skipping');
      } else {
        throw e;
      }
    }

    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();

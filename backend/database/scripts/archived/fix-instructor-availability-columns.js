/**
 * Fix instructor_availability table columns
 * Add missing is_active column
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixColumns() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Rename is_available to is_active (or add is_active if missing)
    console.log('📦 Checking instructor_availability columns...');

    // Check if is_active exists
    const checkCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'instructor_availability' AND column_name = 'is_active'
    `);

    if (checkCol.rows.length === 0) {
      // Check if is_available exists (old column name)
      const checkOld = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'instructor_availability' AND column_name = 'is_available'
      `);

      if (checkOld.rows.length > 0) {
        // Rename is_available to is_active
        console.log('📦 Renaming is_available to is_active...');
        await client.query(`
          ALTER TABLE instructor_availability
          RENAME COLUMN is_available TO is_active
        `);
        console.log('✅ Column renamed\n');
      } else {
        // Add is_active column
        console.log('📦 Adding is_active column...');
        await client.query(`
          ALTER TABLE instructor_availability
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
        `);
        console.log('✅ Column added\n');
      }
    } else {
      console.log('✅ is_active column already exists\n');
    }

    console.log('✅ instructor_availability table fixed!');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixColumns();

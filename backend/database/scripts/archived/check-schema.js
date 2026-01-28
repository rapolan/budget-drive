/**
 * Check Database Schema
 * Shows actual columns in key tables
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkSchema() {
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

    // Check instructor_availability table
    console.log('📋 instructor_availability columns:');
    const iaResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'instructor_availability'
      ORDER BY ordinal_position
    `);

    if (iaResult.rows.length === 0) {
      console.log('   ❌ Table does not exist\n');
    } else {
      iaResult.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type}) ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
      console.log();
    }

    // Check students table
    console.log('📋 students table - audit columns:');
    const studentsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'students'
      AND column_name IN ('created_by', 'updated_by', 'created_at', 'updated_at')
      ORDER BY ordinal_position
    `);
    studentsResult.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });
    console.log();

    // Check lessons table
    console.log('📋 lessons table - audit columns:');
    const lessonsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'lessons'
      AND column_name IN ('created_by', 'updated_by', 'created_at', 'updated_at')
      ORDER BY ordinal_position
    `);
    lessonsResult.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });
    console.log();

    // Check users table
    console.log('📋 users table exists:');
    const usersResult = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = 'users'
    `);
    console.log(`   ${usersResult.rows[0].count === '1' ? '✅ Yes' : '❌ No'}\n`);

    // Count records in key tables
    console.log('📊 Record counts:');
    const tables = ['tenants', 'students', 'instructors', 'lessons', 'users'];
    for (const table of tables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   - ${table}: ${countResult.rows[0].count}`);
      } catch (e) {
        console.log(`   - ${table}: ❌ Table doesn't exist`);
      }
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSchema();

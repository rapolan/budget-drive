/**
 * Check and Create Missing Database Tables
 * Run with: npx ts-node src/scripts/checkAndCreateTables.ts
 */

import { query } from '../config/database';
import fs from 'fs';
import path from 'path';

async function checkAndCreateTables() {
  console.log('🔍 Checking for missing database tables...\n');

  try {
    // Check if instructor_availability table exists
    const checkTableQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'instructor_availability';
    `;

    const result = await query(checkTableQuery);

    if (result.rows.length === 0) {
      console.log('❌ instructor_availability table does NOT exist');
      console.log('📝 Creating table from migration file...\n');

      // Read and execute migration file
      const migrationPath = path.join(__dirname, '../../database/migrations/002_instructor_availability.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      await query(migrationSQL);

      console.log('✅ Migration 002_instructor_availability.sql applied successfully!\n');
    } else {
      console.log('✅ instructor_availability table exists');
    }

    // Check other tables from the migration
    const tables = [
      'instructor_time_off',
      'scheduling_settings',
      'notification_queue'
    ];

    for (const tableName of tables) {
      const checkQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1;
      `;

      const res = await query(checkQuery, [tableName]);

      if (res.rows.length === 0) {
        console.log(`❌ ${tableName} table does NOT exist`);
      } else {
        console.log(`✅ ${tableName} table exists`);
      }
    }

    console.log('\n✅ Database check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking/creating tables:', error);
    process.exit(1);
  }
}

checkAndCreateTables();

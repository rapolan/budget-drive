/**
 * Run migration 015 - Capacity-based scheduling
 */

import { query } from '../config/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    console.log('📦 Running migration: 015_capacity_based_scheduling.sql...');

    const migrationPath = path.join(__dirname, '../../database/migrations/015_capacity_based_scheduling.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await query(migrationSQL);

    console.log('✅ Migration 015 completed successfully!');
    console.log('\n📊 Changes:');
    console.log('  - Updated scheduling_settings: default_lesson_duration → 120 minutes');
    console.log('  - Added scheduling_settings.default_max_students_per_day (default: 3)');
    console.log('  - Added scheduling_settings.lesson_duration_templates');
    console.log('  - Added instructors.max_students_per_day (nullable override)');
    console.log('  - Added instructors.prefers_own_vehicle');
    console.log('  - Added instructors.default_vehicle_id');
    console.log('  - Created view: instructor_effective_capacity');
    console.log('  - Created function: calculate_instructor_end_time()');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runMigration();

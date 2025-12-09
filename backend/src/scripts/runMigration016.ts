import { query } from '../config/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    console.log('📦 Running migration: 016_student_tags.sql...');

    const migrationPath = path.join(__dirname, '../../database/migrations/016_student_tags.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await query(migrationSQL);

    console.log('✅ Migration 016 completed successfully!');
    console.log('\n📊 Changes:');
    console.log('  - Added students.tags column (TEXT array)');
    console.log('  - Created GIN index on tags for faster queries');
    console.log('  - Created student_has_tag() helper function');
    console.log('\n💡 Usage:');
    console.log('  - Tag students with categories like "needs_followup", "vip", "at_risk"');
    console.log('  - Filter students by tag in the Students page');
    console.log('  - Multiple tags per student supported');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runMigration();

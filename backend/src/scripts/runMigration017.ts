import { query } from '../config/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    console.log('📦 Running migration: 017_rollback_tags_add_last_contacted.sql...');

    const migrationPath = path.join(__dirname, '../../database/migrations/017_rollback_tags_add_last_contacted.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await query(migrationSQL);

    console.log('✅ Migration 017 completed successfully!');
    console.log('\n📊 Changes:');
    console.log('  - Removed students.tags column');
    console.log('  - Removed idx_students_tags index');
    console.log('  - Removed student_has_tag() function');
    console.log('  - Added students.last_contacted_at timestamp');
    console.log('  - Created index on last_contacted_at');
    console.log('\n💡 New workflow:');
    console.log('  - System automatically detects students needing follow-up');
    console.log('  - Click "Mark as Contacted" to record follow-up timestamp');
    console.log('  - Track when students were last contacted for better follow-up management');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runMigration();

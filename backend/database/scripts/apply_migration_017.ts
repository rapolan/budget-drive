/**
 * Apply migration 017: Rollback tags and add last_contacted_at
 * Run this with: npx ts-node database/scripts/apply_migration_017.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'driving_school',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function applyMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting migration 017...');

    // Drop tags-related objects
    await client.query('DROP INDEX IF EXISTS idx_students_tags CASCADE');
    console.log('✅ Dropped index idx_students_tags');

    await client.query('DROP FUNCTION IF EXISTS student_has_tag(TEXT[], TEXT) CASCADE');
    console.log('✅ Dropped function student_has_tag');

    await client.query('ALTER TABLE students DROP COLUMN IF EXISTS tags');
    console.log('✅ Dropped column tags');

    // Add last_contacted_at
    await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP');
    console.log('✅ Added column last_contacted_at');

    await client.query('CREATE INDEX IF NOT EXISTS idx_students_last_contacted ON students(last_contacted_at)');
    console.log('✅ Created index idx_students_last_contacted');

    await client.query("COMMENT ON COLUMN students.last_contacted_at IS 'Timestamp when student was last contacted for follow-up'");
    console.log('✅ Added column comment');

    console.log('✨ Migration 017 completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();

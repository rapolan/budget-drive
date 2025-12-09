/**
 * Apply migration 018: Update student status values
 * Run this with: npx ts-node database/scripts/apply_migration_018.ts
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
    console.log('🔄 Starting migration 018...');

    // Drop old constraint
    await client.query('ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check');
    console.log('✅ Dropped old status constraint');

    // Add new constraint with updated values
    await client.query(`
      ALTER TABLE students
      ADD CONSTRAINT students_status_check
      CHECK (status IN ('enrolled', 'active', 'completed', 'dropped', 'suspended', 'permit_expired'))
    `);
    console.log('✅ Added new status constraint with enrolled and permit_expired');

    // Update any inactive students to active
    const result = await client.query(`
      UPDATE students
      SET status = 'active'
      WHERE status = 'inactive'
      RETURNING id
    `);
    console.log(`✅ Updated ${result.rowCount} inactive students to active`);

    // Add comment
    await client.query(`
      COMMENT ON COLUMN students.status IS 'Student status: enrolled (new, no lessons), active (learning), completed (finished hours), dropped (withdrawn), suspended (admin action), permit_expired (internal use only - auto-computed)'
    `);
    console.log('✅ Added column comment');

    console.log('✨ Migration 018 completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();

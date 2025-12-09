/**
 * Script to run migration 019: Emergency contact split
 */

import { query } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  try {
    console.log('Starting migration 019: Emergency contact split...');

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, '../../database/migrations/019_emergency_contact_split.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await query(sql);

    console.log('✓ Migration 019 completed successfully!');
    console.log('  - Added emergency_contact_name column');
    console.log('  - Added emergency_contact_phone column');
    console.log('  - Migrated existing data from emergency_contact field');

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

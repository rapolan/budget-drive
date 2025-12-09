/**
 * Script to run migration 020: Add permit issue date and second emergency contact
 */

import { query } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  try {
    console.log('Starting migration 020: Add permit issue date and second emergency contact...');

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, '../../database/migrations/020_add_permit_issue_and_second_emergency_contact.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await query(sql);

    console.log('✓ Migration 020 completed successfully!');
    console.log('  - Added learner_permit_issue_date column');
    console.log('  - Added emergency_contact_2_name column');
    console.log('  - Added emergency_contact_2_phone column');

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

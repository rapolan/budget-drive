/**
 * Run Migration 006: Merkle Aggregation
 *
 * Adds Merkle tree batching fields to treasury schema
 */

import fs from 'fs';
import path from 'path';
import pool from '../config/database';

async function runMigration() {
  console.log('🔧 Running Migration 006: Merkle Aggregation');
  console.log('='.repeat(60));

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../../database/migrations/006_merkle_aggregation.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded');
    console.log('🚀 Executing SQL...\n');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration 006 completed successfully!');
    console.log('');
    console.log('Changes:');
    console.log('  - Added 5 columns to treasury_transactions:');
    console.log('    * leaf_hash (SHA256)');
    console.log('    * batch_id (UUID)');
    console.log('    * merkle_root (VARCHAR)');
    console.log('    * merkle_proof (JSONB)');
    console.log('    * batch_position (INTEGER)');
    console.log('  - Created merkle_batches table');
    console.log('  - Created helper functions and views');
    console.log('');
    console.log('📊 Schema now supports:');
    console.log('  - Merkle tree aggregation (98-99% profit margin)');
    console.log('  - Batching 100 actions → 1 on-chain TX');
    console.log('  - Transparency mode proof verification');
    console.log('');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runMigration();

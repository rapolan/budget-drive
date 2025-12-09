/**
 * Apply migration 020: Tenant types and referrals
 * Run this with: npx ts-node database/scripts/apply_migration_020.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

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
    console.log('🔄 Starting migration 020: Tenant types and referrals...');

    // Read the migration SQL file
    const migrationPath = path.resolve(__dirname, '../migrations/020_tenant_types_and_referrals.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('✅ Migration 020 completed successfully!');
    console.log('');
    console.log('📦 Changes applied:');
    console.log('   - Added tenant_type column to tenants table');
    console.log('   - Created users table for authentication');
    console.log('   - Created user_tenant_memberships table');
    console.log('   - Created referral_sources table');
    console.log('   - Created referral_reward_configs table');
    console.log('   - Created referrals table');
    console.log('   - Created referral_rewards table');
    console.log('   - Created commission_ledger table');
    console.log('   - Added public profile fields to tenants');
    console.log('');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();

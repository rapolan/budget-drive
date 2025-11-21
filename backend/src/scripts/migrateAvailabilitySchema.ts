/**
 * Migrate instructor_availability Table Schema
 * Run with: npx ts-node src/scripts/migrateAvailabilitySchema.ts
 */

import { query } from '../config/database';

async function migrateSchema() {
  console.log('🔧 Migrating instructor_availability table schema...\n');

  try {
    // Check current schema
    const columnsResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'instructor_availability'
    `);

    const columns = columnsResult.rows.map((r: any) => r.column_name);
    console.log('📋 Current columns:', columns.join(', '));

    // Rename is_available to is_active
    if (columns.includes('is_available') && !columns.includes('is_active')) {
      console.log('\n🔄 Renaming is_available → is_active...');
      await query('ALTER TABLE instructor_availability RENAME COLUMN is_available TO is_active');
      console.log('✅ Column renamed');
    } else if (columns.includes('is_active')) {
      console.log('\n✅ is_active column already exists');
    }

    // Add notes column if missing
    if (!columns.includes('notes')) {
      console.log('\n➕ Adding notes column...');
      await query('ALTER TABLE instructor_availability ADD COLUMN notes TEXT');
      console.log('✅ notes column added');
    } else {
      console.log('\n✅ notes column already exists');
    }

    // Make tenant_id NOT NULL if it isn't
    console.log('\n🔍 Checking tenant_id constraint...');
    const tenantIdResult = await query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'instructor_availability' AND column_name = 'tenant_id'
    `);

    if (tenantIdResult.rows[0]?.is_nullable === 'YES') {
      console.log('🔄 Setting tenant_id to NOT NULL...');
      await query('ALTER TABLE instructor_availability ALTER COLUMN tenant_id SET NOT NULL');
      console.log('✅ tenant_id constraint updated');
    } else {
      console.log('✅ tenant_id is already NOT NULL');
    }

    // Remove old columns if they exist
    if (columns.includes('effective_from')) {
      console.log('\n🗑️  Removing effective_from column...');
      await query('ALTER TABLE instructor_availability DROP COLUMN effective_from');
      console.log('✅ effective_from column removed');
    }

    if (columns.includes('effective_until')) {
      console.log('\n🗑️  Removing effective_until column...');
      await query('ALTER TABLE instructor_availability DROP COLUMN effective_until');
      console.log('✅ effective_until column removed');
    }

    console.log('\n✅ Schema migration completed successfully!');
    console.log('   instructor_availability table is now compatible with the code.\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error migrating schema:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

migrateSchema();

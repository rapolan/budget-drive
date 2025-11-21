/**
 * Fix instructor_availability Table Schema
 * Run with: npx ts-node src/scripts/fixAvailabilitySchema.ts
 */

import { query } from '../config/database';

async function fixSchema() {
  console.log('🔧 Fixing instructor_availability table schema...\n');

  try {
    // Check if there's any data
    const countResult = await query('SELECT COUNT(*) FROM instructor_availability');
    const count = parseInt(countResult.rows[0].count);

    console.log(`📊 Current records in table: ${count}`);

    if (count > 0) {
      console.log('⚠️  WARNING: Table has data. Manual migration required.');
      console.log('   Please back up data before proceeding.\n');
      process.exit(1);
    }

    console.log('✅ Table is empty. Safe to recreate.\n');

    // Drop and recreate table with correct schema
    console.log('🗑️  Dropping old table...');
    await query('DROP TABLE IF EXISTS instructor_availability CASCADE');

    console.log('📝 Creating table with correct schema...');
    await query(`
      CREATE TABLE instructor_availability (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

        -- Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),

        -- Time range
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,

        -- Status
        is_active BOOLEAN DEFAULT true,

        -- Notes (e.g., "Only morning shifts on Mondays")
        notes TEXT,

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        -- Ensure no overlapping availability for same instructor on same day
        CONSTRAINT unique_instructor_day_time UNIQUE (instructor_id, day_of_week, start_time, end_time)
      );
    `);

    console.log('📑 Creating indexes...');
    await query('CREATE INDEX idx_instructor_availability_instructor ON instructor_availability(instructor_id)');
    await query('CREATE INDEX idx_instructor_availability_tenant ON instructor_availability(tenant_id)');
    await query('CREATE INDEX idx_instructor_availability_day ON instructor_availability(day_of_week)');

    console.log('⏰ Creating updated_at trigger...');
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_instructor_availability_updated_at ON instructor_availability;
      CREATE TRIGGER update_instructor_availability_updated_at
        BEFORE UPDATE ON instructor_availability
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('\n✅ instructor_availability table schema fixed successfully!');
    console.log('   You can now add instructor availability through the UI.\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error fixing schema:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

fixSchema();

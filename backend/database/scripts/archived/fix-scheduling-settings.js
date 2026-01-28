/**
 * Create scheduling_settings table
 * Required for availability/scheduling functionality
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createSchedulingSettings() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Create scheduling_settings table
    console.log('📦 Creating scheduling_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduling_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

        -- Default lesson duration
        default_lesson_duration INTEGER DEFAULT 120, -- minutes

        -- Buffer times
        buffer_before_lesson INTEGER DEFAULT 15, -- minutes
        buffer_after_lesson INTEGER DEFAULT 15, -- minutes

        -- Booking rules
        min_advance_booking_hours INTEGER DEFAULT 24,
        max_advance_booking_days INTEGER DEFAULT 90,

        -- Capacity settings
        enable_capacity_limits BOOLEAN DEFAULT true,
        default_max_students_per_slot INTEGER DEFAULT 1,

        -- Working hours
        default_working_hours JSONB DEFAULT '{
          "monday": {"enabled": true, "start": "08:00", "end": "18:00"},
          "tuesday": {"enabled": true, "start": "08:00", "end": "18:00"},
          "wednesday": {"enabled": true, "start": "08:00", "end": "18:00"},
          "thursday": {"enabled": true, "start": "08:00", "end": "18:00"},
          "friday": {"enabled": true, "start": "08:00", "end": "18:00"},
          "saturday": {"enabled": true, "start": "09:00", "end": "15:00"},
          "sunday": {"enabled": false, "start": "10:00", "end": "14:00"}
        }'::jsonb,

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        UNIQUE(tenant_id)
      )
    `);
    console.log('✅ scheduling_settings table created\n');

    // Create trigger
    console.log('📦 Creating trigger...');
    await client.query(`
      DROP TRIGGER IF EXISTS update_scheduling_settings_updated_at ON scheduling_settings;
      CREATE TRIGGER update_scheduling_settings_updated_at
        BEFORE UPDATE ON scheduling_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('✅ Trigger created\n');

    // Insert default settings for existing tenant
    console.log('📦 Inserting default settings for tenant...');
    const tenantResult = await client.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].id;
      await client.query(`
        INSERT INTO scheduling_settings (tenant_id)
        VALUES ($1)
        ON CONFLICT (tenant_id) DO NOTHING
      `, [tenantId]);
      console.log('✅ Default settings inserted\n');
    }

    console.log('✅ Scheduling settings table ready!');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createSchedulingSettings();

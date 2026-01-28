/**
 * Fix instructor_availability table
 * Add missing tenant_id column
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixTable() {
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

    // Add tenant_id column
    console.log('📦 Adding tenant_id column to instructor_availability...');
    await client.query(`
      ALTER TABLE instructor_availability
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
    `);
    console.log('✅ Column added\n');

    // Add index
    console.log('📦 Adding index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_instructor_availability_tenant ON instructor_availability(tenant_id)
    `);
    console.log('✅ Index added\n');

    // Update existing rows to use the first tenant
    console.log('📦 Updating existing rows...');
    const tenantResult = await client.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].id;
      const updateResult = await client.query(
        'UPDATE instructor_availability SET tenant_id = $1 WHERE tenant_id IS NULL',
        [tenantId]
      );
      console.log(`✅ Updated ${updateResult.rowCount} rows\n`);
    }

    console.log('✅ instructor_availability table fixed!');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTable();

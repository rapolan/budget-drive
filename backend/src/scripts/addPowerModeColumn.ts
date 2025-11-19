/**
 * Add enable_blockchain_payments column to tenant_settings
 */

import pool from '../config/database';

async function addColumn() {
  console.log('📊 Adding enable_blockchain_payments column...');
  console.log('');

  try {
    // Add the column if it doesn't exist
    await pool.query(`
      ALTER TABLE tenant_settings
      ADD COLUMN IF NOT EXISTS enable_blockchain_payments BOOLEAN DEFAULT false;
    `);

    console.log('✅ Column added successfully!');
    console.log('');

    // Set it to true for the test tenant
    const tenantId = '55654b9d-6d7f-46e0-ade2-be606abfe00a';

    await pool.query(`
      UPDATE tenant_settings
      SET enable_blockchain_payments = true
      WHERE tenant_id = $1
    `, [tenantId]);

    console.log('✅ Power mode ENABLED for test tenant');
    console.log('');
    console.log('Refresh your browser to see BSV features!');

    await pool.end();
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

addColumn();

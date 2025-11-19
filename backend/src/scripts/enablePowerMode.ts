/**
 * Enable Power User Mode
 * This toggles the enableBlockchainPayments setting for testing
 */

import pool from '../config/database';

async function enablePowerMode() {
  console.log('🔧 Power Mode Toggle Script');
  console.log('='.repeat(50));
  console.log('');

  try {
    const tenantId = '55654b9d-6d7f-46e0-ade2-be606abfe00a';

    // Check current status
    const currentResult = await pool.query(
      'SELECT enable_blockchain_payments FROM tenant_settings WHERE tenant_id = $1',
      [tenantId]
    );

    if (currentResult.rows.length === 0) {
      console.log('❌ No tenant settings found!');
      console.log('Creating default tenant settings...');

      await pool.query(`
        INSERT INTO tenant_settings (
          tenant_id, primary_color, secondary_color, accent_color,
          timezone, currency, language, enable_blockchain_payments,
          enable_google_calendar, enable_certificates, enable_follow_up_tracker
        ) VALUES (
          $1, '#3B82F6', '#1E40AF', '#10B981',
          'America/New_York', 'USD', 'en', true,
          false, false, false
        )
      `, [tenantId]);

      console.log('✅ Tenant settings created with power mode ENABLED');
    } else {
      const currentStatus = currentResult.rows[0].enable_blockchain_payments;
      console.log('Current power mode status:', currentStatus);

      // Toggle it
      const newStatus = !currentStatus;
      await pool.query(
        'UPDATE tenant_settings SET enable_blockchain_payments = $1 WHERE tenant_id = $2',
        [newStatus, tenantId]
      );

      console.log('');
      if (newStatus) {
        console.log('✅ Power mode ENABLED!');
        console.log('   You should now see:');
        console.log('   - Satoshi amounts');
        console.log('   - BSV blockchain links');
        console.log('   - Wright philosophy sections');
      } else {
        console.log('⚠️  Power mode DISABLED');
        console.log('   You should now see:');
        console.log('   - Clean UI with USD only');
        console.log('   - No blockchain terminology');
      }
    }

    // Check treasury transactions
    console.log('');
    console.log('📊 Treasury Transactions:');
    console.log('='.repeat(50));

    const txResult = await pool.query(`
      SELECT id, bsv_action, bsv_satoshis, bsv_txid, bsv_status, created_at
      FROM treasury_transactions
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [tenantId]);

    if (txResult.rows.length === 0) {
      console.log('❌ No transactions found');
      console.log('');
      console.log('Run this to create a test transaction:');
      console.log('npm run test:treasury');
    } else {
      console.log(`Found ${txResult.rows.length} transaction(s):`);
      console.log('');

      txResult.rows.forEach((tx, i) => {
        console.log(`${i + 1}. ${tx.bsv_action} - ${tx.bsv_satoshis} sats`);
        console.log(`   TXID: ${tx.bsv_txid || 'N/A'}`);
        console.log(`   Status: ${tx.bsv_status}`);
        console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    await pool.end();
    console.log('');
    console.log('✅ Done! Refresh your browser to see changes.');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

enablePowerMode();

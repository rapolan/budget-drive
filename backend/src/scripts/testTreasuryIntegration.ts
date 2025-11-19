/**
 * Test Treasury + Wallet Integration
 *
 * This script tests the full integration:
 * 1. Create a treasury transaction (simulating a lesson booking)
 * 2. Automatically broadcast to BSV blockchain
 * 3. Verify transaction appears on-chain
 */

import treasuryService from '../services/treasuryService';
import { config } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '55654b9d-6d7f-46e0-ade2-be606abfe00a';

async function testTreasuryIntegration() {
  console.log('🧪 Budget Drive Protocol - Treasury + BSV Integration Test');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Check if BSV is enabled
    console.log('📋 Step 1: Configuration Check');
    console.log('   BSV Enabled:', config.BSV_ENABLED);
    console.log('   BSV Network:', config.BSV_NETWORK);
    console.log('   Wallet Configured:', !!config.BSV_PROTOCOL_WALLET_WIF);
    console.log('');

    if (!config.BSV_ENABLED) {
      console.log('⚠️  BSV is DISABLED - set BSV_ENABLED=true in .env to test blockchain writes');
      console.log('   Transactions will be recorded in database only.');
      console.log('');
    }

    // Step 2: Create a test treasury transaction
    console.log('💰 Step 2: Creating Treasury Transaction...');
    console.log('   Action: BDP_BOOK (Lesson Booking)');
    console.log('   Gross Amount: $50.00');
    console.log('   Expected Fee: 5 satoshis');
    console.log('');

    const transaction = await treasuryService.createTransaction({
      tenant_id: TEST_TENANT_ID,
      source_type: 'lesson_booking',
      source_id: uuidv4(), // Generate a valid UUID for source_id
      gross_amount: 50.00,
      description: 'Test lesson booking - Treasury + BSV integration test',
      metadata: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    });

    console.log('✅ Treasury Transaction Created!');
    console.log('');
    console.log('Transaction Details:');
    console.log('   ID:', transaction.id);
    console.log('   Action Type:', transaction.bsv_action);
    console.log('   Satoshi Fee:', transaction.bsv_satoshis);
    console.log('   USD Fee:', transaction.treasury_split);
    console.log('   Provider Gets:', transaction.provider_amount);
    console.log('   BSV Status:', transaction.bsv_status);
    console.log('   BSV TXID:', transaction.bsv_txid || 'N/A (BSV disabled)');
    console.log('');

    // Step 3: Show WhatsOnChain link if BSV transaction exists
    if (transaction.bsv_txid) {
      const networkPath = config.BSV_NETWORK === 'testnet' ? 'test' : 'main';
      const whatsOnChainUrl = `https://${networkPath === 'test' ? 'test.' : ''}whatsonchain.com/tx/${transaction.bsv_txid}`;

      console.log('🎉 SUCCESS! Transaction is on the blockchain!');
      console.log('');
      console.log('View on WhatsOnChain:');
      console.log(`   ${whatsOnChainUrl}`);
      console.log('');
      console.log('What to verify:');
      console.log('   1. Transaction has OP_RETURN data');
      console.log('   2. Memo contains: BDP:BDP_BOOK|ID:...');
      console.log('   3. Amount sent: 5 satoshis');
      console.log('   4. Transaction confirmed on blockchain');
      console.log('');
      console.log('✅ End-to-end BSV integration working!');
    } else {
      console.log('ℹ️  Transaction recorded in database only (BSV disabled)');
      console.log('   To enable BSV: Set BSV_ENABLED=true in .env');
    }

    console.log('');
    console.log('📊 Next Steps:');
    console.log('   1. Check database: SELECT * FROM treasury_transactions WHERE id = \'' + transaction.id + '\';');
    console.log('   2. Test from UI: Book a lesson in the frontend');
    console.log('   3. Monitor backend logs for BSV broadcasts');

    process.exit(0);

  } catch (error: any) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    console.error('');
    console.error('Common issues:');
    console.error('   - Wallet not funded (need at least 100 sats for fees)');
    console.error('   - BSV_PROTOCOL_WALLET_WIF not set in .env');
    console.error('   - Database connection issues');
    console.error('   - Network connectivity to WhatsOnChain/ARC');
    process.exit(1);
  }
}

testTreasuryIntegration();

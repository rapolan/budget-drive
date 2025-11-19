/**
 * Test First BSV Transaction on Testnet
 *
 * This script tests our wallet service by:
 * 1. Loading the wallet from .env
 * 2. Checking the balance
 * 3. Sending a small test transaction
 *
 * BEFORE RUNNING:
 * - Fund your testnet wallet from: https://scrypt.io/faucet/
 * - Enter address: mxnpmB7d5RjXVAoHyc6rk2RZvoazBi4y7F
 * - Get free TAAL API key (optional): https://console.taal.com/
 */

import { getProtocolWallet } from '../services/walletService';
import { config } from '../config/env';

async function testFirstTransaction() {
  console.log('🧪 Budget Drive Protocol - First BSV Transaction Test');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Step 1: Load wallet from .env
    console.log('📂 Step 1: Loading wallet from .env...');

    if (!config.BSV_PROTOCOL_WALLET_WIF) {
      throw new Error('❌ BSV_PROTOCOL_WALLET_WIF not found in .env file!');
    }

    const wallet = getProtocolWallet();

    console.log('✅ Wallet loaded successfully');
    console.log('   Address:', wallet.getAddress());
    console.log('   Network:', config.BSV_NETWORK);
    console.log('');

    // Step 2: Check balance
    console.log('💰 Step 2: Checking balance...');
    const balance = await wallet.getBalance();

    console.log('   Balance:', balance, 'satoshis');
    console.log('   Note: Balance checking not yet fully implemented');
    console.log('   (Proceeding with transaction test anyway)');

    if (balance === 0) {
      console.log('');
      console.log('⚠️  WARNING: Wallet reports zero balance!');
      console.log('');
      console.log('To fund your testnet wallet:');
      console.log('1. Visit: https://scrypt.io/faucet/');
      console.log('2. Enter your address:', wallet.getAddress());
      console.log('3. Request testnet coins');
      console.log('4. Wait 1-2 minutes for confirmation');
      console.log('5. Check on WhatsOnChain: https://test.whatsonchain.com/address/' + wallet.getAddress());
      console.log('');
      console.log('If you already funded it, we\'ll try sending anyway...');
      console.log('');
    }

    console.log('');

    // Step 3: Send test transaction
    console.log('📤 Step 3: Sending test transaction (5 satoshis)...');
    console.log('');

    // Send 5 sats back to ourselves as a test
    const result = await wallet.sendSats({
      toAddress: wallet.getAddress(), // Send to self for testing
      amountSats: 5,
      memo: 'BDP_TEST: First transaction from Budget Drive Protocol',
    });

    if (result.success) {
      console.log('✅ Transaction successful!');
      console.log('');
      console.log('Transaction Details:');
      console.log('   TXID:', result.txid);
      console.log('   Fee:', result.fee, 'satoshis');
      console.log('   View on WhatsOnChain:');
      console.log('   https://test.whatsonchain.com/tx/' + result.txid);
      console.log('');
      console.log('🎉 SUCCESS! Your first BDP transaction is on the blockchain!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Wait 1-2 minutes for confirmation');
      console.log('2. Check WhatsOnChain link above');
      console.log('3. See the OP_RETURN memo in the transaction');
      console.log('4. Ready to integrate with treasuryService!');
    } else {
      console.log('❌ Transaction failed:', result.error);
      console.log('');
      console.log('Common issues:');
      console.log('- Insufficient balance (need at least 50 sats for fees)');
      console.log('- Network connectivity issues');
      console.log('- Invalid TAAL API key (optional, but helps)');
    }

    console.log('');
    process.exit(result.success ? 0 : 1);

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testFirstTransaction();

/**
 * Generate Testnet Wallet Script
 *
 * This script generates a new BSV testnet wallet for development.
 * Run once to create the protocol wallet, then save the private key in .env
 *
 * Usage:
 *   npx ts-node src/scripts/generateTestnetWallet.ts
 */

import { createWallet } from '../services/walletService';

console.log('🔧 Budget Drive Protocol - Testnet Wallet Generator');
console.log('='.repeat(60));
console.log('');

// Create new testnet wallet
const wallet = createWallet('testnet');

console.log('✅ New testnet wallet generated successfully!');
console.log('');
console.log('📋 WALLET DETAILS:');
console.log('─'.repeat(60));
console.log('Network:     testnet');
console.log('Address:    ', wallet.getAddress());
console.log('Private Key:', wallet.getPrivateKeyWif());
console.log('─'.repeat(60));
console.log('');

console.log('🔐 SECURITY INSTRUCTIONS:');
console.log('1. Copy the private key (WIF) above');
console.log('2. Add to backend/.env file:');
console.log(`   BSV_PROTOCOL_WALLET_WIF=${wallet.getPrivateKeyWif()}`);
console.log(`   BSV_NETWORK=testnet`);
console.log('3. NEVER commit .env to git (already in .gitignore)');
console.log('4. For production, generate a mainnet wallet separately');
console.log('');

const faucetInfo = wallet.getFaucetInstructions();
console.log('💰 FUND YOUR WALLET:');
console.log('1. Visit BSV testnet faucet:', faucetInfo.faucetUrl);
console.log('2. Enter your address:', faucetInfo.address);
console.log('3. Request testnet BSV (free)');
console.log('4. Wait 1-2 minutes for confirmation');
console.log('5. Test sending transactions!');
console.log('');

console.log('✨ Next Steps:');
console.log('1. Fund this wallet with testnet BSV from faucet');
console.log('2. Run: npm run test:wallet (to test transaction sending)');
console.log('3. Integrate with treasuryService to enable real BSV fees');
console.log('');
console.log('🚀 Once this works on testnet, we switch to mainnet and go live!');

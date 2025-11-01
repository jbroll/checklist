/**
 * Setup script to create a Jazz worker account for the BetterAuth database adapter
 *
 * Run this once to generate worker credentials:
 * npm run setup-worker
 */

import { Account } from 'jazz-tools';

async function setupWorker() {
  console.log('🎵 Creating Jazz worker account...\n');

  // Create a new worker account
  const worker = await Account.create({
    name: 'BetterAuth Database Worker',
    peer: process.env.JAZZ_PEER || 'wss://cloud.jazz.tools',
  });

  console.log('✅ Worker account created!\n');
  console.log('Add these to your backend/.env file:\n');
  console.log(`JAZZ_WORKER_ACCOUNT_ID=${worker.id}`);
  console.log(`JAZZ_WORKER_SECRET=${worker.agentSecret}\n`);
  console.log('⚠️  Keep the JAZZ_WORKER_SECRET secure and never commit it to git!\n');

  process.exit(0);
}

setupWorker().catch((error) => {
  console.error('❌ Error creating worker account:', error);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Jazz Agent Rotation Script
 *
 * Rotates the Jazz agent by having the old agent add the new agent
 * to all shared folder groups before switching over.
 *
 * Usage:
 *   npx tsx scripts/rotate-agent.ts \
 *     --new-id <new_agent_account_id> \
 *     --new-secret <new_agent_secret>
 *
 * The old agent credentials are read from the current .env file.
 * Run this BEFORE updating .env with the new credentials.
 */

import Database from 'better-sqlite3';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { startWorker } from 'jazz-tools/worker';
import { Account, CoMap, type ID } from 'jazz-tools';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load current .env (contains OLD agent credentials)
config({ path: resolve(__dirname, '../.env') });

const dbPath = process.env.AUTH_DB_PATH || resolve(__dirname, '../auth.db');

function parseArgs(): { newId: string; newSecret: string } {
  const args = process.argv.slice(2);
  let newId = '';
  let newSecret = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--new-id' && args[i + 1]) {
      newId = args[i + 1];
      i++;
    } else if (args[i] === '--new-secret' && args[i + 1]) {
      newSecret = args[i + 1];
      i++;
    }
  }

  if (!newId || !newSecret) {
    console.error('Usage: npx tsx scripts/rotate-agent.ts --new-id <id> --new-secret <secret>');
    console.error('');
    console.error('Get new credentials from https://dashboard.jazz.tools');
    process.exit(1);
  }

  return { newId, newSecret };
}

async function rotateAgent() {
  const { newId, newSecret } = parseArgs();

  // Get old agent credentials from env
  const oldId = process.env.JAZZ_AGENT_ACCOUNT_ID;
  const oldSecret = process.env.JAZZ_AGENT_SECRET;
  const jazzPeer = process.env.JAZZ_PEER || 'wss://cloud.jazz.tools';
  const jazzApiKey = process.env.JAZZ_API_KEY || process.env.VITE_JAZZ_API_KEY;

  if (!oldId || !oldSecret) {
    console.error('ERROR: Old agent credentials not found in .env');
    console.error('Make sure JAZZ_AGENT_ACCOUNT_ID and JAZZ_AGENT_SECRET are set');
    process.exit(1);
  }

  console.log('Jazz Agent Rotation');
  console.log('===================');
  console.log(`Old agent: ${oldId.slice(0, 16)}...`);
  console.log(`New agent: ${newId.slice(0, 16)}...`);
  console.log('');

  // Get all unique folder IDs from share_invites
  const db = new Database(dbPath);
  const folders = db.prepare(`
    SELECT DISTINCT folder_covalue_id FROM share_invites
  `).all() as Array<{ folder_covalue_id: string }>;

  if (folders.length === 0) {
    console.log('No shared folders found. Nothing to migrate.');
    console.log('');
    console.log('You can safely update .env with the new credentials.');
    db.close();
    process.exit(0);
  }

  console.log(`Found ${folders.length} shared folder(s) to migrate.`);
  console.log('');

  // Build sync server URL
  const syncServer = jazzApiKey ? `${jazzPeer}/?key=${jazzApiKey}` : jazzPeer;

  // Start OLD agent
  console.log('Connecting old agent...');
  const oldWorkerResult = await startWorker({
    syncServer,
    accountID: oldId as ID<Account>,
    accountSecret: oldSecret,
  });
  const oldWorker = oldWorkerResult.worker;
  console.log('Old agent connected.');

  // Load new agent account (so we can add it to groups)
  console.log('Loading new agent account...');
  const newAgentAccount = await Account.load(newId as ID<Account>, {
    loadAs: oldWorker,
  });

  if (!newAgentAccount) {
    console.error(`ERROR: Could not load new agent account ${newId}`);
    console.error('Make sure the new agent exists and is accessible.');
    process.exit(1);
  }
  console.log('New agent account loaded.');
  console.log('');

  // Migrate each folder
  let success = 0;
  let failed = 0;

  for (const { folder_covalue_id } of folders) {
    process.stdout.write(`Migrating ${folder_covalue_id.slice(0, 16)}... `);

    try {
      // Load folder as old agent
      const folder = await CoMap.load(folder_covalue_id as ID<CoMap>, {
        loadAs: oldWorker,
      });

      if (!folder) {
        console.log('SKIP (folder not found or no access)');
        failed++;
        continue;
      }

      const ownerGroup = folder.$jazz.owner;

      // Check if new agent is already a member
      const existingMember = ownerGroup.members?.find(
        (m: { id: string }) => m.id === newId
      );

      if (existingMember) {
        console.log('SKIP (already a member)');
        success++;
        continue;
      }

      // Add new agent as admin
      ownerGroup.addMember(newAgentAccount, 'admin');

      // Wait for sync
      await ownerGroup.$jazz.waitForSync();

      console.log('OK');
      success++;
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log('');
  console.log('Migration complete.');
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log('');

  if (failed === 0) {
    console.log('All folders migrated successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update backend/.env with new credentials:');
    console.log(`   JAZZ_AGENT_ACCOUNT_ID=${newId}`);
    console.log(`   JAZZ_AGENT_SECRET=${newSecret}`);
    console.log('2. Redeploy the backend');
  } else {
    console.log('Some folders failed to migrate.');
    console.log('You may need to manually re-share those folders after rotation.');
  }

  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

rotateAgent().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

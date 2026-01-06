#!/usr/bin/env npx tsx
/**
 * Jazz Agent Rotation Script
 *
 * Rotates the Jazz agent by having the old agent add the new agent
 * to all shared folder groups before switching over.
 *
 * Usage:
 *   npx tsx scripts/rotate-agent.ts <command> [options]
 *
 * Commands:
 *   migrate     Add new agent to all shared folder groups (run BEFORE updating secrets)
 *   verify      Verify new agent can access all shared folders (run AFTER updating secrets)
 *   cleanup     Remove old agent from all shared folder groups (run AFTER verification)
 *
 * Examples:
 *   # Step 1: Migrate (old agent adds new agent to groups)
 *   npx tsx scripts/rotate-agent.ts migrate \
 *     --new-id co_xxx --new-secret "sealerSecret_.../signerSecret_..."
 *
 *   # Step 2: Update secrets.env with new credentials, redeploy
 *
 *   # Step 3: Verify new agent works
 *   npx tsx scripts/rotate-agent.ts verify
 *
 *   # Step 4: Cleanup old agent (optional, for security)
 *   npx tsx scripts/rotate-agent.ts cleanup \
 *     --old-id co_xxx --old-secret "sealerSecret_.../signerSecret_..."
 */

import Database from 'better-sqlite3';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { config } from 'dotenv';
import { startWorker } from 'jazz-tools/worker';
import { Account, CoMap, type ID } from 'jazz-tools';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load secrets.env first (production secrets), then .env (local overrides)
config({ path: resolve(__dirname, '../secrets.env') });
config({ path: resolve(__dirname, '../.env') });
// Also load root .env for VITE_JAZZ_API_KEY
config({ path: resolve(__dirname, '../../.env') });

const dbPath = process.env.AUTH_DB_PATH || resolve(__dirname, '../data/auth.db');

interface ParsedArgs {
  command: string;
  newId?: string;
  newSecret?: string;
  oldId?: string;
  oldSecret?: string;
  dryRun: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  let newId: string | undefined;
  let newSecret: string | undefined;
  let oldId: string | undefined;
  let oldSecret: string | undefined;
  let dryRun = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--new-id' && args[i + 1]) {
      newId = args[++i];
    } else if (args[i] === '--new-secret' && args[i + 1]) {
      newSecret = args[++i];
    } else if (args[i] === '--old-id' && args[i + 1]) {
      oldId = args[++i];
    } else if (args[i] === '--old-secret' && args[i + 1]) {
      oldSecret = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { command, newId, newSecret, oldId, oldSecret, dryRun };
}

function showHelp() {
  console.log(`
Jazz Agent Rotation Script

Usage: npx tsx scripts/rotate-agent.ts <command> [options]

Commands:
  migrate     Add new agent to all shared folder groups
  verify      Verify current agent can access all shared folders
  cleanup     Remove old agent from all shared folder groups
  help        Show this help

Options:
  --new-id <id>         New agent account ID (for migrate)
  --new-secret <secret> New agent secret (for migrate)
  --old-id <id>         Old agent account ID (for cleanup)
  --old-secret <secret> Old agent secret (for cleanup)
  --dry-run             Preview without making changes

Safe Rotation Procedure:
  1. Create new agent at https://dashboard.jazz.tools
  2. Run: npx tsx scripts/rotate-agent.ts migrate --new-id co_xxx --new-secret "..."
  3. Update backend/secrets.env with new JAZZ_AGENT_ACCOUNT_ID and JAZZ_AGENT_SECRET
  4. Redeploy: ./deploy-full.sh prod
  5. Run: npx tsx scripts/rotate-agent.ts verify
  6. (Optional) Run: npx tsx scripts/rotate-agent.ts cleanup --old-id co_xxx --old-secret "..."
`);
}

// Get shared folder IDs from database
// - pendingOnly=true: Only folders with pending (unaccepted, unexpired) invites
// - pendingOnly=false: All folders that have ever had shares
function getSharedFolders(pendingOnly = false): string[] {
  if (!existsSync(dbPath)) {
    return [];
  }

  const db = new Database(dbPath);

  // Check if table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='share_invites'
  `).get();

  if (!tableExists) {
    db.close();
    return [];
  }

  let query = `SELECT DISTINCT folder_covalue_id FROM share_invites`;
  if (pendingOnly) {
    // Only get folders where agent is actively needed (pending invites that could still be accepted)
    query += ` WHERE accepted_at IS NULL AND expires_at > datetime('now')`;
  }

  const folders = db.prepare(query).all() as Array<{ folder_covalue_id: string }>;

  db.close();
  return folders.map(f => f.folder_covalue_id);
}

// Get Jazz sync server URL
function getSyncServer(): string {
  const jazzPeer = process.env.JAZZ_PEER || 'wss://cloud.jazz.tools';
  const jazzApiKey = process.env.JAZZ_API_KEY || process.env.VITE_JAZZ_API_KEY;
  return jazzApiKey ? `${jazzPeer}/?key=${jazzApiKey}` : jazzPeer;
}

// MIGRATE: Add new agent to all shared folder groups
async function cmdMigrate(args: ParsedArgs) {
  const { newId, newSecret, dryRun } = args;

  if (!newId || !newSecret) {
    console.error('ERROR: --new-id and --new-secret are required for migrate');
    console.error('');
    console.error('Usage: npx tsx scripts/rotate-agent.ts migrate --new-id co_xxx --new-secret "..."');
    process.exit(1);
  }

  const currentId = process.env.JAZZ_AGENT_ACCOUNT_ID;
  const currentSecret = process.env.JAZZ_AGENT_SECRET;

  if (!currentId || !currentSecret) {
    console.error('ERROR: Current agent credentials not found');
    console.error('Make sure JAZZ_AGENT_ACCOUNT_ID and JAZZ_AGENT_SECRET are set in secrets.env');
    process.exit(1);
  }

  console.log('Jazz Agent Migration');
  console.log('====================');
  console.log(`Current agent: ${currentId.slice(0, 20)}...`);
  console.log(`New agent:     ${newId.slice(0, 20)}...`);
  console.log(`Dry run:       ${dryRun}`);
  console.log('');

  // Only migrate groups with pending invites (unaccepted, unexpired)
  // The agent is only needed to process accept requests
  const pendingFolders = getSharedFolders(true);
  const allFolders = getSharedFolders(false);

  console.log(`Share statistics:`);
  console.log(`  Total folders with shares: ${allFolders.length}`);
  console.log(`  Folders with pending invites: ${pendingFolders.length}`);
  console.log('');

  if (pendingFolders.length === 0) {
    console.log('✓ No pending invites found. Nothing to migrate.');
    console.log('');
    if (allFolders.length > 0) {
      console.log(`  Note: ${allFolders.length} folder(s) have accepted/expired shares.`);
      console.log('  The agent is not needed for these (recipients have direct access).');
      console.log('');
    }
    console.log('You can safely update secrets.env with new credentials:');
    console.log(`  JAZZ_AGENT_ACCOUNT_ID=${newId}`);
    console.log(`  JAZZ_AGENT_SECRET=${newSecret}`);
    return;
  }

  const folders = pendingFolders;
  console.log(`Migrating ${folders.length} folder(s) with pending invites...`);
  console.log('');

  // Connect as current agent
  console.log('Connecting current agent...');
  const workerResult = await startWorker({
    syncServer: getSyncServer(),
    accountID: currentId as ID<Account>,
    accountSecret: currentSecret,
  });
  const worker = workerResult.worker;
  console.log('✓ Current agent connected.');

  // Load new agent account
  console.log('Loading new agent account...');
  const newAgentAccount = await Account.load(newId as ID<Account>, {
    loadAs: worker,
  });

  if (!newAgentAccount) {
    console.error(`✗ Could not load new agent account ${newId}`);
    console.error('  Make sure the new agent exists and is accessible.');
    process.exit(1);
  }
  console.log('✓ New agent account loaded.');
  console.log('');

  // Migrate each folder
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const folderId of folders) {
    process.stdout.write(`  ${folderId.slice(0, 20)}... `);

    try {
      const folder = await CoMap.load(folderId as ID<CoMap>, { loadAs: worker });

      if (!folder) {
        console.log('SKIP (not found)');
        skipped++;
        continue;
      }

      const ownerGroup = folder.$jazz.owner;
      const existingMember = ownerGroup.members?.find((m: { id: string }) => m.id === newId);

      if (existingMember) {
        console.log('SKIP (already member)');
        skipped++;
        continue;
      }

      if (!dryRun) {
        ownerGroup.addMember(newAgentAccount, 'admin');
        await ownerGroup.$jazz.waitForSync();
      }

      console.log(dryRun ? 'WOULD ADD' : 'OK');
      success++;
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Results: ${success} migrated, ${skipped} skipped, ${failed} failed`);

  if (failed > 0) {
    console.log('');
    console.error('✗ Some folders failed to migrate. Do NOT proceed until resolved.');
    process.exit(1);
  }

  console.log('');
  if (dryRun) {
    console.log('This was a dry run. To apply changes, run without --dry-run');
  } else {
    console.log('✓ Migration complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Update backend/secrets.env:');
    console.log(`     JAZZ_AGENT_ACCOUNT_ID=${newId}`);
    console.log(`     JAZZ_AGENT_SECRET=${newSecret}`);
    console.log('  2. Redeploy: ./deploy-full.sh prod');
    console.log('  3. Verify: npx tsx scripts/rotate-agent.ts verify');
  }
}

// VERIFY: Check that current agent can access all shared folders
async function cmdVerify(_args: ParsedArgs) {
  const currentId = process.env.JAZZ_AGENT_ACCOUNT_ID;
  const currentSecret = process.env.JAZZ_AGENT_SECRET;

  if (!currentId || !currentSecret) {
    console.error('ERROR: Agent credentials not found');
    console.error('Make sure JAZZ_AGENT_ACCOUNT_ID and JAZZ_AGENT_SECRET are set');
    process.exit(1);
  }

  console.log('Jazz Agent Verification');
  console.log('=======================');
  console.log(`Agent: ${currentId.slice(0, 20)}...`);
  console.log('');

  // Verify folders with pending invites (critical - agent must have access)
  const pendingFolders = getSharedFolders(true);

  console.log(`Share statistics:`);
  console.log(`  Folders with pending invites: ${pendingFolders.length}`);
  console.log('');

  if (pendingFolders.length === 0) {
    console.log('✓ No pending invites to verify.');
    console.log('  Agent rotation is complete - no pending invites require access.');
    return;
  }

  const folders = pendingFolders;
  console.log(`Verifying access to ${folders.length} folder(s) with pending invites...`);
  console.log('');

  // Connect as current agent
  const workerResult = await startWorker({
    syncServer: getSyncServer(),
    accountID: currentId as ID<Account>,
    accountSecret: currentSecret,
  });
  const worker = workerResult.worker;

  let success = 0;
  let failed = 0;

  for (const folderId of folders) {
    process.stdout.write(`  ${folderId.slice(0, 20)}... `);

    try {
      const folder = await CoMap.load(folderId as ID<CoMap>, { loadAs: worker });

      if (!folder) {
        console.log('FAILED (cannot load)');
        failed++;
        continue;
      }

      // Check we're a member with admin access
      const ownerGroup = folder.$jazz.owner;
      const member = ownerGroup.members?.find((m: { id: string }) => m.id === currentId);

      if (!member) {
        console.log('FAILED (not a member)');
        failed++;
        continue;
      }

      console.log('OK');
      success++;
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Results: ${success} accessible, ${failed} failed`);

  if (failed > 0) {
    console.log('');
    console.error('✗ Some folders are not accessible. Rotation may have failed.');
    console.error('  Consider rolling back to old credentials and re-running migration.');
    process.exit(1);
  }

  console.log('');
  console.log('✓ All folders verified! Agent rotation successful.');
  console.log('');
  console.log('Optional: Remove old agent from groups for security:');
  console.log('  npx tsx scripts/rotate-agent.ts cleanup --old-id co_xxx --old-secret "..."');
}

// CLEANUP: Remove old agent from all shared folder groups
async function cmdCleanup(args: ParsedArgs) {
  const { oldId, oldSecret, dryRun } = args;

  if (!oldId || !oldSecret) {
    console.error('ERROR: --old-id and --old-secret are required for cleanup');
    console.error('');
    console.error('Usage: npx tsx scripts/rotate-agent.ts cleanup --old-id co_xxx --old-secret "..."');
    process.exit(1);
  }

  const currentId = process.env.JAZZ_AGENT_ACCOUNT_ID;
  const currentSecret = process.env.JAZZ_AGENT_SECRET;

  if (!currentId || !currentSecret) {
    console.error('ERROR: Current agent credentials not found');
    process.exit(1);
  }

  if (currentId === oldId) {
    console.error('ERROR: Old agent ID matches current agent ID');
    console.error('  Make sure you updated secrets.env with new credentials first');
    process.exit(1);
  }

  console.log('Jazz Agent Cleanup');
  console.log('==================');
  console.log(`Current agent: ${currentId.slice(0, 20)}...`);
  console.log(`Old agent:     ${oldId.slice(0, 20)}...`);
  console.log(`Dry run:       ${dryRun}`);
  console.log('');

  // Check ALL folders (not just pending) to fully remove old agent
  const folders = getSharedFolders(false);

  if (folders.length === 0) {
    console.log('✓ No shared folders. Nothing to clean up.');
    return;
  }

  console.log(`Checking ${folders.length} shared folder(s) for old agent membership...`);
  console.log('');

  // Connect as current (new) agent to remove old agent
  const workerResult = await startWorker({
    syncServer: getSyncServer(),
    accountID: currentId as ID<Account>,
    accountSecret: currentSecret,
  });
  const worker = workerResult.worker;

  // Load old agent account
  const oldAgentAccount = await Account.load(oldId as ID<Account>, { loadAs: worker });
  if (!oldAgentAccount) {
    console.log('⚠ Could not load old agent account (may already be removed)');
    return;
  }

  let removed = 0;
  let skipped = 0;
  let failed = 0;

  for (const folderId of folders) {
    process.stdout.write(`  ${folderId.slice(0, 20)}... `);

    try {
      const folder = await CoMap.load(folderId as ID<CoMap>, { loadAs: worker });

      if (!folder) {
        console.log('SKIP (cannot load)');
        skipped++;
        continue;
      }

      const ownerGroup = folder.$jazz.owner;
      const oldMember = ownerGroup.members?.find((m: { id: string }) => m.id === oldId);

      if (!oldMember) {
        console.log('SKIP (not a member)');
        skipped++;
        continue;
      }

      if (!dryRun) {
        ownerGroup.removeMember(oldAgentAccount);
        await ownerGroup.$jazz.waitForSync();
      }

      console.log(dryRun ? 'WOULD REMOVE' : 'REMOVED');
      removed++;
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Results: ${removed} removed, ${skipped} skipped, ${failed} failed`);

  if (dryRun) {
    console.log('');
    console.log('This was a dry run. To apply changes, run without --dry-run');
  } else if (failed === 0) {
    console.log('');
    console.log('✓ Cleanup complete! Old agent has been removed from all groups.');
  }
}

// Main
async function main() {
  const args = parseArgs();

  switch (args.command) {
    case 'migrate':
      await cmdMigrate(args);
      break;
    case 'verify':
      await cmdVerify(args);
      break;
    case 'cleanup':
      await cmdCleanup(args);
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      console.error('Run with "help" for usage');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

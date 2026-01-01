#!/usr/bin/env npx tsx
/**
 * BETTER_AUTH_SECRET Rotation Script
 *
 * Rotates the BetterAuth secret by:
 * 1. Generating a new secret (or using NEW_SECRET env var)
 * 2. Decrypting all user.encryptedCredentials with old secret
 * 3. Re-encrypting with new secret
 * 4. Updating the database
 * 5. Optionally updating the secrets file
 *
 * Usage:
 *   npx tsx scripts/rotate-better-auth-secret.ts
 *
 * Environment variables:
 *   OLD_SECRET - Current secret (or reads from secrets file)
 *   NEW_SECRET - New secret (or generates one)
 *   SECRETS_FILE - Path to secrets file to update (optional)
 *   DRY_RUN - Set to "true" to preview without changes
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createHash } from '@better-auth/utils/hash';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, managedNonce, utf8ToBytes } from '@noble/ciphers/utils.js';

// Configuration
const DB_PATH = process.env.AUTH_DB_PATH || './data/auth.db';
const SECRETS_FILE = process.env.SECRETS_FILE || './secrets.env';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Get old secret from env or secrets file
function getOldSecret(): string {
  if (process.env.OLD_SECRET) {
    return process.env.OLD_SECRET;
  }

  // Try to read from secrets file
  if (existsSync(SECRETS_FILE)) {
    const content = readFileSync(SECRETS_FILE, 'utf-8');
    const match = content.match(/BETTER_AUTH_SECRET=(.+)/);
    if (match) {
      return match[1].trim();
    }
  }

  throw new Error('OLD_SECRET not provided and could not read from secrets file');
}

// Generate or get new secret
function getNewSecret(): string {
  if (process.env.NEW_SECRET) {
    return process.env.NEW_SECRET;
  }

  // Generate new secret
  const newSecret = execSync('openssl rand -base64 32').toString().trim();
  console.log('[rotate] Generated new secret');
  return newSecret;
}

// BetterAuth encryption uses xchacha20poly1305 via @noble/ciphers
// This matches the implementation in better-auth/dist/crypto-*.mjs

// Decrypt using the same algorithm as BetterAuth
async function decrypt(encrypted: string, secret: string): Promise<string> {
  try {
    const keyAsBytes = await createHash('SHA-256').digest(secret);
    const dataAsBytes = hexToBytes(encrypted);
    const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
    return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
  } catch (error) {
    throw new Error(`Decryption failed: ${error}`);
  }
}

// Encrypt using the same algorithm as BetterAuth
async function encrypt(plaintext: string, secret: string): Promise<string> {
  const keyAsBytes = await createHash('SHA-256').digest(secret);
  const dataAsBytes = utf8ToBytes(plaintext);
  return bytesToHex(managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes)).encrypt(dataAsBytes));
}

async function main() {
  console.log('[rotate] BETTER_AUTH_SECRET Rotation Script');
  console.log(`[rotate] Database: ${DB_PATH}`);
  console.log(`[rotate] Secrets file: ${SECRETS_FILE}`);
  console.log(`[rotate] Dry run: ${DRY_RUN}`);
  console.log('');

  // Get secrets
  const oldSecret = getOldSecret();
  const newSecret = getNewSecret();

  console.log(`[rotate] Old secret: ${oldSecret.substring(0, 8)}...`);
  console.log(`[rotate] New secret: ${newSecret.substring(0, 8)}...`);
  console.log('');

  // Open database
  if (!existsSync(DB_PATH)) {
    throw new Error(`Database not found: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);

  // Get all users with encrypted credentials
  const users = db.prepare(`
    SELECT id, email, encryptedCredentials
    FROM user
    WHERE encryptedCredentials IS NOT NULL AND encryptedCredentials != ''
  `).all() as { id: string; email: string; encryptedCredentials: string }[];

  console.log(`[rotate] Found ${users.length} users with encrypted credentials`);

  if (users.length === 0) {
    console.log('[rotate] No users to migrate');
    return;
  }

  // Process each user
  let success = 0;
  let failed = 0;

  const updateStmt = db.prepare(`
    UPDATE user SET encryptedCredentials = ? WHERE id = ?
  `);

  for (const user of users) {
    try {
      // Decrypt with old secret
      const decrypted = await decrypt(user.encryptedCredentials, oldSecret);

      // Re-encrypt with new secret
      const reencrypted = await encrypt(decrypted, newSecret);

      if (!DRY_RUN) {
        updateStmt.run(reencrypted, user.id);
      }

      console.log(`[rotate] ✓ ${user.email}`);
      success++;
    } catch (error) {
      console.error(`[rotate] ✗ ${user.email}: ${error}`);
      failed++;
    }
  }

  console.log('');
  console.log(`[rotate] Results: ${success} success, ${failed} failed`);

  if (failed > 0) {
    console.error('[rotate] Some users failed to migrate. DO NOT update the secret until resolved.');
    process.exit(1);
  }

  // Update secrets file
  if (!DRY_RUN && existsSync(SECRETS_FILE)) {
    console.log('');
    console.log(`[rotate] Updating ${SECRETS_FILE}...`);

    let content = readFileSync(SECRETS_FILE, 'utf-8');
    content = content.replace(
      /BETTER_AUTH_SECRET=.+/,
      `BETTER_AUTH_SECRET=${newSecret}`
    );
    writeFileSync(SECRETS_FILE, content);

    console.log('[rotate] ✓ Secrets file updated');
  }

  console.log('');
  console.log('[rotate] Rotation complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Update secrets-test.env if not already done');
  console.log('2. Update backend/.env for local development');
  console.log('3. Redeploy: ./deploy-full.sh prod');
  console.log('4. Test OAuth login');

  if (DRY_RUN) {
    console.log('');
    console.log('(This was a dry run - no changes were made)');
  }

  db.close();
}

main().catch((error) => {
  console.error('[rotate] Fatal error:', error);
  process.exit(1);
});

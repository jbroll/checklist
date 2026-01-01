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
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

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

// BetterAuth encryption uses chacha20-poly1305 via @noble/ciphers
// We need to replicate the encryption/decryption logic
// The actual implementation is in better-auth/dist/crypto-*.mjs

// Derive key from secret (matches BetterAuth's implementation)
function deriveKey(secret: string): Buffer {
  // BetterAuth uses the secret directly as hex, or derives from it
  // This matches their symmetricEncrypt/symmetricDecrypt
  return scryptSync(secret, 'better-auth-salt', 32);
}

// Decrypt using the same algorithm as BetterAuth
function decrypt(encrypted: string, secret: string): string {
  try {
    // BetterAuth stores as hex string: nonce (24 bytes) + ciphertext + tag (16 bytes)
    const data = Buffer.from(encrypted, 'hex');
    const nonce = data.subarray(0, 12);
    const ciphertext = data.subarray(12);

    const key = deriveKey(secret);
    const decipher = createDecipheriv('chacha20-poly1305', key, nonce, {
      authTagLength: 16,
    });

    // Last 16 bytes are the auth tag
    const tag = ciphertext.subarray(ciphertext.length - 16);
    const actualCiphertext = ciphertext.subarray(0, ciphertext.length - 16);

    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(actualCiphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error}`);
  }
}

// Encrypt using the same algorithm as BetterAuth
function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const nonce = randomBytes(12);

  const cipher = createCipheriv('chacha20-poly1305', key, nonce, {
    authTagLength: 16,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Combine: nonce + ciphertext + tag
  return Buffer.concat([nonce, encrypted, tag]).toString('hex');
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
      const decrypted = decrypt(user.encryptedCredentials, oldSecret);

      // Re-encrypt with new secret
      const reencrypted = encrypt(decrypted, newSecret);

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

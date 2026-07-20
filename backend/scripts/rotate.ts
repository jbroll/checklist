#!/usr/bin/env npx tsx
/**
 * Key Rotation CLI
 *
 * Unified tool for rotating all application secrets.
 *
 * Usage:
 *   npx tsx scripts/rotate.ts <command> [options]
 *
 * Commands:
 *   list              Show status of all secrets
 *   test              Test rotation procedures (dry-run validation)
 *   backup            Create backup of database and secrets files
 *   better-auth       Rotate BETTER_AUTH_SECRET
 *   apple             Generate new APPLE_CLIENT_SECRET
 *   help              Show this help message
 *
 * Examples:
 *   npx tsx scripts/rotate.ts list
 *   npx tsx scripts/rotate.ts test
 *   npx tsx scripts/rotate.ts backup
 *   npx tsx scripts/rotate.ts better-auth --dry-run
 *   npx tsx scripts/rotate.ts apple --key ~/AuthKey.p8 --key-id XXX --team-id YYY
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { createPrivateKey, createSign } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { config } from 'dotenv';
import Database from 'better-sqlite3';
import { createHash } from '@better-auth/utils/hash';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, managedNonce, utf8ToBytes } from '@noble/ciphers/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../secrets.env') });

// Paths
const SECRETS_FILE = resolve(__dirname, '../secrets.env');
const SECRETS_TEST_FILE = resolve(__dirname, '../secrets-test.env');
const AUTH_DB = process.env.AUTH_DB_PATH || resolve(__dirname, '../data/auth.db');
const TEST_DATA_DIR = resolve(__dirname, '../../test-data');
const BACKUPS_DIR = resolve(__dirname, '../backups');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg: string) { console.log(msg); }
function success(msg: string) { console.log(`${colors.green}✓${colors.reset} ${msg}`); }
function warn(msg: string) { console.log(`${colors.yellow}⚠${colors.reset} ${msg}`); }
function error(msg: string) { console.log(`${colors.red}✗${colors.reset} ${msg}`); }
function info(msg: string) { console.log(`${colors.blue}ℹ${colors.reset} ${msg}`); }
function header(msg: string) { console.log(`\n${colors.bold}${msg}${colors.reset}`); }

// =============================================================================
// UTILITIES
// =============================================================================

function getSecretFromFile(key: string, file = SECRETS_FILE): string | null {
  if (!existsSync(file)) return null;
  const content = readFileSync(file, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function updateSecretInFile(key: string, value: string, file = SECRETS_FILE): void {
  if (!existsSync(file)) {
    throw new Error(`Secrets file not found: ${file}`);
  }
  let content = readFileSync(file, 'utf-8');
  const regex = new RegExp(`^${key}=.+$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  writeFileSync(file, content);
}

async function decrypt(encrypted: string, secret: string): Promise<string> {
  const keyAsBytes = await createHash('SHA-256').digest(secret);
  const dataAsBytes = hexToBytes(encrypted);
  const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
  return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
}

async function encrypt(plaintext: string, secret: string): Promise<string> {
  const keyAsBytes = await createHash('SHA-256').digest(secret);
  const dataAsBytes = utf8ToBytes(plaintext);
  return bytesToHex(managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes)).encrypt(dataAsBytes));
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

// =============================================================================
// BACKUP UTILITIES
// =============================================================================

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureBackupsDir(): void {
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

interface BackupResult {
  file: string;
  backupPath: string;
  success: boolean;
  error?: string;
}

function backupFile(filePath: string, label?: string): BackupResult {
  const fileName = basename(filePath);
  const timestamp = getTimestamp();
  const backupName = label
    ? `${fileName}.${label}.${timestamp}`
    : `${fileName}.${timestamp}`;
  const backupPath = resolve(BACKUPS_DIR, backupName);

  ensureBackupsDir();

  if (!existsSync(filePath)) {
    return { file: filePath, backupPath, success: false, error: 'File not found' };
  }

  try {
    copyFileSync(filePath, backupPath);
    return { file: filePath, backupPath, success: true };
  } catch (e) {
    return { file: filePath, backupPath, success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function createFullBackup(label?: string): BackupResult[] {
  const results: BackupResult[] = [];

  // Backup auth.db if it exists
  if (existsSync(AUTH_DB)) {
    results.push(backupFile(AUTH_DB, label));
  }

  // Backup secrets files
  if (existsSync(SECRETS_FILE)) {
    results.push(backupFile(SECRETS_FILE, label));
  }

  if (existsSync(SECRETS_TEST_FILE)) {
    results.push(backupFile(SECRETS_TEST_FILE, label));
  }

  return results;
}

function listBackups(): string[] {
  if (!existsSync(BACKUPS_DIR)) {
    return [];
  }
  return readdirSync(BACKUPS_DIR).sort().reverse();
}

// =============================================================================
// COMMAND: help
// =============================================================================

function showHelp() {
  log(`
${colors.bold}Key Rotation CLI${colors.reset}

Unified tool for rotating all application secrets.

${colors.bold}USAGE${colors.reset}
  npx tsx scripts/rotate.ts <command> [options]

${colors.bold}COMMANDS${colors.reset}
  ${colors.cyan}list${colors.reset}              Show status of all secrets
  ${colors.cyan}test${colors.reset}              Test rotation procedures (validates without changes)
  ${colors.cyan}backup${colors.reset}            Create backup of database and secrets files
  ${colors.cyan}better-auth${colors.reset}       Rotate BETTER_AUTH_SECRET (re-encrypts user credentials)
  ${colors.cyan}apple${colors.reset}             Generate new APPLE_CLIENT_SECRET (JWT)
  ${colors.cyan}help${colors.reset}              Show this help message

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}# Show current secret status${colors.reset}
  npx tsx scripts/rotate.ts list

  ${colors.dim}# Test rotation without making changes${colors.reset}
  npx tsx scripts/rotate.ts test

  ${colors.dim}# Create backup before rotation${colors.reset}
  npx tsx scripts/rotate.ts backup

  ${colors.dim}# Rotate BetterAuth secret (dry-run first, auto-backs up)${colors.reset}
  npx tsx scripts/rotate.ts better-auth --dry-run
  npx tsx scripts/rotate.ts better-auth

  ${colors.dim}# Generate new Apple client secret${colors.reset}
  npx tsx scripts/rotate.ts apple --key ~/AuthKey.p8 --key-id 67VV567DZ8 --team-id 6QN29TYW92

${colors.bold}DOCUMENTATION${colors.reset}
  See docs/KEY_ROTATION.md for detailed procedures and emergency protocols.
`);
}

// =============================================================================
// COMMAND: backup
// =============================================================================

function cmdBackup(args: Record<string, string | boolean>) {
  const label = typeof args['label'] === 'string' ? args['label'] : undefined;
  const listOnly = args['list'] === true;

  header('Backup Management');
  log('');

  if (listOnly) {
    const backups = listBackups();
    if (backups.length === 0) {
      info('No backups found');
      log('');
      log(`Backup directory: ${BACKUPS_DIR}`);
    } else {
      info(`Found ${backups.length} backup(s):`);
      log('');
      for (const backup of backups.slice(0, 20)) {
        log(`  ${backup}`);
      }
      if (backups.length > 20) {
        log(`  ... and ${backups.length - 20} more`);
      }
    }
    return;
  }

  info('Creating backup...');
  log('');

  const results = createFullBackup(label);

  if (results.length === 0) {
    warn('No files found to backup');
    return;
  }

  for (const result of results) {
    if (result.success) {
      success(`${basename(result.file)} → ${basename(result.backupPath)}`);
    } else {
      error(`${basename(result.file)}: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  log('');
  if (failedCount === 0) {
    success(`Backup complete: ${successCount} file(s)`);
  } else {
    warn(`Backup partial: ${successCount} success, ${failedCount} failed`);
  }

  log('');
  log(`Backup location: ${BACKUPS_DIR}`);
}

// =============================================================================
// COMMAND: list
// =============================================================================

interface SecretStatus {
  name: string;
  configured: boolean;
  valid: boolean;
  expires?: Date;
  notes?: string;
}

async function cmdList() {
  header('Secret Status');
  log('');

  const secrets: SecretStatus[] = [];

  // BETTER_AUTH_SECRET
  const betterAuth = getSecretFromFile('BETTER_AUTH_SECRET');
  secrets.push({
    name: 'BETTER_AUTH_SECRET',
    configured: !!betterAuth,
    valid: !!betterAuth && betterAuth.length >= 32,
    notes: betterAuth ? `${betterAuth.length} chars` : 'Not configured',
  });

  // JAZZ_AGENT_SECRET
  const jazzAgent = getSecretFromFile('JAZZ_AGENT_SECRET');
  const jazzAgentValid = !!jazzAgent && jazzAgent.includes('/') &&
    jazzAgent.startsWith('sealerSecret_');
  secrets.push({
    name: 'JAZZ_AGENT_SECRET',
    configured: !!jazzAgent,
    valid: jazzAgentValid,
    notes: jazzAgentValid ? 'Valid format' : 'Invalid or missing',
  });

  // JAZZ_AGENT_ACCOUNT_ID
  const jazzAgentId = getSecretFromFile('JAZZ_AGENT_ACCOUNT_ID');
  secrets.push({
    name: 'JAZZ_AGENT_ACCOUNT_ID',
    configured: !!jazzAgentId,
    valid: !!jazzAgentId && jazzAgentId.startsWith('co_'),
    notes: jazzAgentId ? jazzAgentId.slice(0, 20) + '...' : 'Not configured',
  });

  // APPLE_CLIENT_SECRET
  const apple = getSecretFromFile('APPLE_CLIENT_SECRET');
  let appleExpires: Date | undefined;
  let appleValid = false;
  if (apple) {
    try {
      const parts = apple.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        appleExpires = new Date(payload.exp * 1000);
        appleValid = appleExpires > new Date();
      }
    } catch { /* invalid JWT */ }
  }
  secrets.push({
    name: 'APPLE_CLIENT_SECRET',
    configured: !!apple,
    valid: appleValid,
    expires: appleExpires,
    notes: appleExpires
      ? `Expires ${appleExpires.toISOString().split('T')[0]}`
      : 'Not configured or invalid',
  });

  // GOOGLE_CLIENT_SECRET
  const google = getSecretFromFile('GOOGLE_CLIENT_SECRET');
  secrets.push({
    name: 'GOOGLE_CLIENT_SECRET',
    configured: !!google,
    valid: !!google && google.startsWith('GOCSPX-'),
    notes: google ? 'Configured' : 'Not configured',
  });

  // STRIPE_SECRET_KEY
  const stripe = getSecretFromFile('STRIPE_SECRET_KEY');
  const stripeValid = !!stripe && (stripe.startsWith('sk_test_') || stripe.startsWith('sk_live_'));
  secrets.push({
    name: 'STRIPE_SECRET_KEY',
    configured: !!stripe,
    valid: stripeValid,
    notes: stripe
      ? stripe.startsWith('sk_live_') ? 'Live mode' : 'Test mode'
      : 'Not configured (billing disabled)',
  });

  // STRIPE_WEBHOOK_SECRET
  const stripeWebhook = getSecretFromFile('STRIPE_WEBHOOK_SECRET');
  secrets.push({
    name: 'STRIPE_WEBHOOK_SECRET',
    configured: !!stripeWebhook,
    valid: !!stripeWebhook && stripeWebhook.startsWith('whsec_'),
    notes: stripeWebhook ? 'Configured' : 'Not configured',
  });

  // SMTP_PASS
  const smtp = getSecretFromFile('SMTP_PASS');
  secrets.push({
    name: 'SMTP_PASS',
    configured: !!smtp,
    valid: !!smtp && smtp.length > 0,
    notes: smtp ? 'Configured' : 'Not configured',
  });

  // Print table
  const maxName = Math.max(...secrets.map(s => s.name.length));
  for (const s of secrets) {
    const status = s.valid
      ? `${colors.green}✓${colors.reset}`
      : s.configured
        ? `${colors.yellow}⚠${colors.reset}`
        : `${colors.red}✗${colors.reset}`;
    const name = s.name.padEnd(maxName);
    log(`  ${status} ${name}  ${colors.dim}${s.notes}${colors.reset}`);
  }

  // Warnings
  log('');
  const expiring = secrets.filter(s => s.expires && s.expires.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000);
  for (const s of expiring) {
    const days = Math.floor((s.expires!.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    warn(`${s.name} expires in ${days} days`);
  }

  const invalid = secrets.filter(s => s.configured && !s.valid);
  for (const s of invalid) {
    warn(`${s.name} has invalid format`);
  }
}

// =============================================================================
// COMMAND: test
// =============================================================================

async function cmdTest() {
  header('Key Rotation Test Suite');

  interface TestResult { name: string; passed: boolean; message: string; }
  const results: TestResult[] = [];

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      results.push({ name, passed: true, message: 'OK' });
      success(name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ name, passed: false, message: msg });
      error(`${name}: ${msg}`);
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  // Check prerequisites
  header('Prerequisites');

  const prodDb = resolve(TEST_DATA_DIR, 'auth-prod.db');
  await test('Production auth.db available', () => {
    assert(existsSync(prodDb), `Missing ${prodDb}. Run: scp checklist-app.rkroll.com:/var/lib/checklist-api-data/auth.db ../test-data/auth-prod.db`);
  });

  await test('Secrets file exists', () => {
    assert(existsSync(SECRETS_FILE), `Missing ${SECRETS_FILE}`);
  });

  const betterAuthSecret = getSecretFromFile('BETTER_AUTH_SECRET');
  await test('BETTER_AUTH_SECRET configured', () => {
    assert(!!betterAuthSecret, 'BETTER_AUTH_SECRET not found');
  });

  if (!existsSync(prodDb) || !betterAuthSecret) {
    warn('Skipping rotation tests due to missing prerequisites');
    return;
  }

  // Test BETTER_AUTH_SECRET rotation
  header('BETTER_AUTH_SECRET Rotation');

  const testDb = resolve(TEST_DATA_DIR, 'auth-test-rotation.db');
  if (existsSync(testDb)) unlinkSync(testDb);
  copyFileSync(prodDb, testDb);

  const db = new Database(testDb);
  const users = db.prepare(`
    SELECT id, email, encryptedCredentials FROM user
    WHERE encryptedCredentials IS NOT NULL AND encryptedCredentials != ''
  `).all() as { id: string; email: string; encryptedCredentials: string }[];

  await test('Found users with encrypted credentials', () => {
    assert(users.length > 0, 'No users found');
  });

  for (const user of users) {
    await test(`Decrypt ${user.email}`, async () => {
      const decrypted = await decrypt(user.encryptedCredentials, betterAuthSecret);
      const parsed = JSON.parse(decrypted);
      assert('accountID' in parsed, 'Missing accountID');
      assert('accountSecret' in parsed, 'Missing accountSecret');
    });
  }

  const newSecret = 'TestRotationSecret123456789012345=';
  await test('Round-trip encryption', async () => {
    for (const user of users) {
      const original = await decrypt(user.encryptedCredentials, betterAuthSecret);
      const reencrypted = await encrypt(original, newSecret);
      const roundTrip = await decrypt(reencrypted, newSecret);
      assert(original === roundTrip, 'Round-trip failed');
    }
  });

  db.close();
  if (existsSync(testDb)) unlinkSync(testDb);

  // Test APPLE_CLIENT_SECRET
  header('APPLE_CLIENT_SECRET');

  const apple = getSecretFromFile('APPLE_CLIENT_SECRET');
  await test('Valid JWT format', () => {
    assert(!!apple, 'Not configured');
    const parts = apple!.split('.');
    assert(parts.length === 3, 'Should have 3 parts');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    assert(header.alg === 'ES256', 'Algorithm should be ES256');
  });

  await test('Not expired', () => {
    const parts = apple!.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const exp = new Date(payload.exp * 1000);
    assert(exp > new Date(), `Expired on ${exp.toISOString()}`);
  });

  // Test JAZZ_AGENT_SECRET
  header('JAZZ_AGENT_SECRET');

  const jazzSecret = getSecretFromFile('JAZZ_AGENT_SECRET');
  await test('Valid format', () => {
    assert(!!jazzSecret, 'Not configured');
    assert(jazzSecret!.includes('/'), 'Missing separator');
    const [sealer, signer] = jazzSecret!.split('/');
    assert(sealer.startsWith('sealerSecret_'), 'Invalid sealer');
    assert(signer.startsWith('signerSecret_'), 'Invalid signer');
  });

  // Summary
  header('Summary');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    log('');
    error('Some tests failed');
    process.exit(1);
  } else {
    log('');
    success('All tests passed');
  }
}

// =============================================================================
// COMMAND: better-auth
// =============================================================================

async function cmdBetterAuth(args: Record<string, string | boolean>) {
  const dryRun = args['dry-run'] === true;
  const dbPath = typeof args['db'] === 'string' ? args['db'] : AUTH_DB;

  header('BETTER_AUTH_SECRET Rotation');
  info(`Database: ${dbPath}`);
  info(`Dry run: ${dryRun}`);
  log('');

  // Get old secret
  const oldSecret = typeof args['old-secret'] === 'string'
    ? args['old-secret']
    : getSecretFromFile('BETTER_AUTH_SECRET');

  if (!oldSecret) {
    error('OLD_SECRET not provided and not found in secrets file');
    log('');
    log('Usage: npx tsx scripts/rotate.ts better-auth [options]');
    log('');
    log('Options:');
    log('  --dry-run       Preview changes without modifying database');
    log('  --old-secret    Current secret (reads from secrets.env if not provided)');
    log('  --new-secret    New secret (generates random if not provided)');
    log('  --db            Path to auth.db (defaults to ./data/auth.db)');
    process.exit(1);
  }

  // Get or generate new secret
  const newSecret = typeof args['new-secret'] === 'string'
    ? args['new-secret']
    : execSync('openssl rand -base64 32').toString().trim();

  info(`Old secret: ${oldSecret.slice(0, 8)}...`);
  info(`New secret: ${newSecret.slice(0, 8)}...`);
  log('');

  // Open database
  if (!existsSync(dbPath)) {
    error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  // Create backup before making changes (unless dry-run)
  if (!dryRun) {
    info('Creating backup before rotation...');
    const backupResults = createFullBackup('pre-rotation');
    for (const result of backupResults) {
      if (result.success) {
        success(`Backed up ${basename(result.file)}`);
      } else {
        error(`Failed to backup ${basename(result.file)}: ${result.error}`);
      }
    }
    const backupFailed = backupResults.some(r => !r.success);
    if (backupFailed) {
      error('Backup failed. Aborting rotation for safety.');
      process.exit(1);
    }
    log('');
  }

  const db = new Database(dbPath);
  const users = db.prepare(`
    SELECT id, email, encryptedCredentials FROM user
    WHERE encryptedCredentials IS NOT NULL AND encryptedCredentials != ''
  `).all() as { id: string; email: string; encryptedCredentials: string }[];

  info(`Found ${users.length} users with encrypted credentials`);
  log('');

  if (users.length === 0) {
    success('No users to migrate');
    db.close();
    return;
  }

  // Process each user
  let successCount = 0;
  let failedCount = 0;

  const updateStmt = db.prepare('UPDATE user SET encryptedCredentials = ? WHERE id = ?');

  for (const user of users) {
    try {
      const decrypted = await decrypt(user.encryptedCredentials, oldSecret);
      const reencrypted = await encrypt(decrypted, newSecret);

      if (!dryRun) {
        updateStmt.run(reencrypted, user.id);
      }

      success(user.email);
      successCount++;
    } catch (e) {
      error(`${user.email}: ${e instanceof Error ? e.message : e}`);
      failedCount++;
    }
  }

  log('');
  info(`Results: ${successCount} success, ${failedCount} failed`);

  if (failedCount > 0) {
    error('Some users failed. DO NOT update the secret until resolved.');
    db.close();
    process.exit(1);
  }

  // Update secrets file
  if (!dryRun) {
    log('');
    info('Updating secrets.env...');
    updateSecretInFile('BETTER_AUTH_SECRET', newSecret);
    success('Secrets file updated');
  }

  db.close();

  log('');
  success('Rotation complete!');
  log('');
  log('Next steps:');
  log('  1. Update backend/.env for local development');
  log('  2. Redeploy: ./deploy-full.sh prod');
  log('  3. Test OAuth login');

  if (dryRun) {
    log('');
    warn('This was a dry run - no changes were made');
  }
}

// =============================================================================
// COMMAND: apple
// =============================================================================

function cmdApple(args: Record<string, string | boolean>) {
  header('APPLE_CLIENT_SECRET Generation');

  const keyPath = typeof args['key'] === 'string' ? args['key'] : process.env.APPLE_KEY_PATH;
  const keyId = typeof args['key-id'] === 'string' ? args['key-id'] : process.env.APPLE_KEY_ID || '67VV567DZ8';
  const teamId = typeof args['team-id'] === 'string' ? args['team-id'] : process.env.APPLE_TEAM_ID || '6QN29TYW92';
  const clientId = typeof args['client-id'] === 'string' ? args['client-id'] : process.env.APPLE_CLIENT_ID || 'com.rkroll.checklist.sa';
  const expiresDays = typeof args['expires'] === 'string' ? parseInt(args['expires'], 10) : 180;

  if (!keyPath) {
    log('');
    log('Usage: npx tsx scripts/rotate.ts apple --key <path> [options]');
    log('');
    log('Options:');
    log('  --key           Path to .p8 private key file (required)');
    log('  --key-id        Key ID from Apple Developer (default: 67VV567DZ8)');
    log('  --team-id       Team ID from Apple Developer (default: 6QN29TYW92)');
    log('  --client-id     Service ID / Client ID (default: com.rkroll.checklist.sa)');
    log('  --expires       Expiration in days, max 180 (default: 180)');
    log('');
    log('Example:');
    log('  npx tsx scripts/rotate.ts apple --key ~/Downloads/AuthKey_67VV567DZ8.p8');
    process.exit(1);
  }

  // Resolve key path
  const resolvedKeyPath = keyPath.startsWith('~')
    ? keyPath.replace('~', homedir())
    : resolve(keyPath);

  if (!existsSync(resolvedKeyPath)) {
    error(`Key file not found: ${resolvedKeyPath}`);
    process.exit(1);
  }

  info(`Key file: ${resolvedKeyPath}`);
  info(`Key ID: ${keyId}`);
  info(`Team ID: ${teamId}`);
  info(`Client ID: ${clientId}`);
  info(`Expires: ${expiresDays} days`);
  log('');

  // Read private key
  const privateKeyPem = readFileSync(resolvedKeyPath, 'utf8');
  const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem' });

  // Build JWT
  const now = Math.floor(Date.now() / 1000);
  const maxExpiration = 180 * 24 * 60 * 60;
  const requestedExpiration = expiresDays * 24 * 60 * 60;
  const expiration = Math.min(requestedExpiration, maxExpiration);

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + expiration,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  function base64url(data: string | Buffer): string {
    return Buffer.from(data)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = createSign('SHA256');
  sign.update(signingInput);
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  const signatureB64 = base64url(signature);

  const jwt = `${signingInput}.${signatureB64}`;

  const expirationDate = new Date((now + expiration) * 1000);

  success('JWT generated successfully');
  log('');
  log(`Expires: ${expirationDate.toISOString().split('T')[0]}`);
  log('');
  log('Add to backend/secrets.env:');
  log('');
  log(`APPLE_CLIENT_ID=${clientId}`);
  log(`APPLE_CLIENT_SECRET=${jwt}`);
  log('');
  log('Then redeploy: ./deploy-full.sh prod');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case 'list':
      await cmdList();
      break;
    case 'test':
      await cmdTest();
      break;
    case 'backup':
      cmdBackup(args);
      break;
    case 'better-auth':
      await cmdBetterAuth(args);
      break;
    case 'apple':
      cmdApple(args);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      error(`Unknown command: ${command}`);
      log('Run "npx tsx scripts/rotate.ts help" for usage');
      process.exit(1);
  }
}

main().catch((e) => {
  error(`Fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Auth CLI - Manage auth database for testing
 *
 * Usage:
 *   npx tsx scripts/auth-cli.ts list              - List all users
 *   npx tsx scripts/auth-cli.ts verify <email>    - Set emailVerified=true
 *   npx tsx scripts/auth-cli.ts unverify <email>  - Set emailVerified=false
 *   npx tsx scripts/auth-cli.ts delete <email>    - Delete user and accounts
 */

import Database from 'better-sqlite3';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.AUTH_DB_PATH || resolve(__dirname, '../auth.db');
const db = new Database(dbPath);

const command = process.argv[2];
const email = process.argv[3];

function listUsers() {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.emailVerified, u.createdAt,
           GROUP_CONCAT(a.providerId) as providers
    FROM user u
    LEFT JOIN account a ON a.userId = u.id
    GROUP BY u.id
    ORDER BY u.createdAt DESC
  `).all();

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  console.log('\nUsers:\n');
  for (const user of users as any[]) {
    const verified = user.emailVerified ? '✓' : '✗';
    const providers = user.providers || 'none';
    console.log(`  ${verified} ${user.email}`);
    console.log(`    Name: ${user.name}`);
    console.log(`    Providers: ${providers}`);
    console.log(`    Created: ${user.createdAt}`);
    console.log('');
  }
}

function setVerified(email: string, verified: boolean) {
  const result = db.prepare(`
    UPDATE user SET emailVerified = ? WHERE email = ?
  `).run(verified ? 1 : 0, email);

  if (result.changes === 0) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  console.log(`Set emailVerified=${verified} for ${email}`);
}

function deleteUser(email: string) {
  const user = db.prepare('SELECT id FROM user WHERE email = ?').get(email) as { id: string } | undefined;

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  // Delete related records
  db.prepare('DELETE FROM session WHERE userId = ?').run(user.id);
  db.prepare('DELETE FROM account WHERE userId = ?').run(user.id);
  db.prepare('DELETE FROM verification WHERE identifier = ?').run(email);
  db.prepare('DELETE FROM user WHERE id = ?').run(user.id);

  console.log(`Deleted user: ${email}`);
}

// Main
switch (command) {
  case 'list':
    listUsers();
    break;
  case 'verify':
    if (!email) {
      console.error('Usage: auth-cli verify <email>');
      process.exit(1);
    }
    setVerified(email, true);
    break;
  case 'unverify':
    if (!email) {
      console.error('Usage: auth-cli unverify <email>');
      process.exit(1);
    }
    setVerified(email, false);
    break;
  case 'delete':
    if (!email) {
      console.error('Usage: auth-cli delete <email>');
      process.exit(1);
    }
    deleteUser(email);
    break;
  default:
    console.log(`
Auth CLI - Manage auth database for testing

Usage:
  npx tsx scripts/auth-cli.ts list              - List all users
  npx tsx scripts/auth-cli.ts verify <email>    - Set emailVerified=true
  npx tsx scripts/auth-cli.ts unverify <email>  - Set emailVerified=false
  npx tsx scripts/auth-cli.ts delete <email>    - Delete user and accounts
`);
}

db.close();

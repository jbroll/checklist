#!/usr/bin/env node
/**
 * Generate Apple Client Secret (JWT) for Sign In with Apple
 *
 * Usage:
 *   node scripts/generate-apple-secret.mjs \
 *     --key ~/Downloads/AuthKey_XXXXXXXXXX.p8 \
 *     --key-id XXXXXXXXXX \
 *     --team-id XXXXXXXXXX \
 *     --client-id com.example.app.si
 *
 * Or with environment variables:
 *   APPLE_KEY_PATH=~/Downloads/AuthKey_XXXXXXXXXX.p8 \
 *   APPLE_KEY_ID=XXXXXXXXXX \
 *   APPLE_TEAM_ID=XXXXXXXXXX \
 *   APPLE_CLIENT_ID=com.example.app.si \
 *   node scripts/generate-apple-secret.mjs
 */

import { readFileSync } from 'fs';
import { createPrivateKey, createSign } from 'crypto';
import { resolve } from 'path';
import { homedir } from 'os';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i + 1]) {
      parsed.keyPath = args[++i];
    } else if (args[i] === '--key-id' && args[i + 1]) {
      parsed.keyId = args[++i];
    } else if (args[i] === '--team-id' && args[i + 1]) {
      parsed.teamId = args[++i];
    } else if (args[i] === '--client-id' && args[i + 1]) {
      parsed.clientId = args[++i];
    } else if (args[i] === '--expires' && args[i + 1]) {
      parsed.expiresDays = parseInt(args[++i], 10);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Generate Apple Client Secret (JWT) for Sign In with Apple

Usage:
  node scripts/generate-apple-secret.mjs [options]

Options:
  --key <path>        Path to .p8 key file (or APPLE_KEY_PATH env var)
  --key-id <id>       Key ID from Apple (or APPLE_KEY_ID env var)
  --team-id <id>      Team ID from Apple (or APPLE_TEAM_ID env var)
  --client-id <id>    Service ID / Client ID (or APPLE_CLIENT_ID env var)
  --expires <days>    Expiration in days, max 180 (default: 180)
  --help, -h          Show this help

Example:
  node scripts/generate-apple-secret.mjs \\
    --key ~/Downloads/AuthKey_3G93L773A2.p8 \\
    --key-id 3G93L773A2 \\
    --team-id ABC123DEF4 \\
    --client-id com.rkroll.bubblelist.si
`);
      process.exit(0);
    }
  }

  return parsed;
}

// Base64URL encode (no padding, URL-safe)
function base64url(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Generate the JWT
function generateAppleClientSecret({ keyPath, keyId, teamId, clientId, expiresDays = 180 }) {
  // Expand ~ to home directory
  const resolvedKeyPath = keyPath.startsWith('~')
    ? keyPath.replace('~', homedir())
    : resolve(keyPath);

  // Read the private key
  const privateKeyPem = readFileSync(resolvedKeyPath, 'utf8');

  // Create the private key object
  const privateKey = createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
  });

  // JWT Header
  const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT',
  };

  // JWT Payload
  const now = Math.floor(Date.now() / 1000);
  const maxExpiration = 180 * 24 * 60 * 60; // 180 days in seconds
  const requestedExpiration = expiresDays * 24 * 60 * 60;
  const expiration = Math.min(requestedExpiration, maxExpiration);

  const payload = {
    iss: teamId,
    iat: now,
    exp: now + expiration,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  // Create the signing input
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with ES256
  const sign = createSign('SHA256');
  sign.update(signingInput);
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  const signatureB64 = base64url(signature);

  // Return the complete JWT
  return `${signingInput}.${signatureB64}`;
}

// Main
function main() {
  const args = parseArgs();

  // Get values from args or environment
  const keyPath = args.keyPath || process.env.APPLE_KEY_PATH;
  const keyId = args.keyId || process.env.APPLE_KEY_ID;
  const teamId = args.teamId || process.env.APPLE_TEAM_ID;
  const clientId = args.clientId || process.env.APPLE_CLIENT_ID;
  const expiresDays = args.expiresDays || 180;

  // Validate required fields
  const missing = [];
  if (!keyPath) missing.push('--key or APPLE_KEY_PATH');
  if (!keyId) missing.push('--key-id or APPLE_KEY_ID');
  if (!teamId) missing.push('--team-id or APPLE_TEAM_ID');
  if (!clientId) missing.push('--client-id or APPLE_CLIENT_ID');

  if (missing.length > 0) {
    console.error('Error: Missing required parameters:');
    missing.forEach(m => console.error(`  - ${m}`));
    console.error('\nRun with --help for usage information.');
    process.exit(1);
  }

  try {
    const secret = generateAppleClientSecret({
      keyPath,
      keyId,
      teamId,
      clientId,
      expiresDays,
    });

    const expirationDate = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

    console.log('\n=== Apple Client Secret Generated ===\n');
    console.log('Configuration used:');
    console.log(`  Key ID:     ${keyId}`);
    console.log(`  Team ID:    ${teamId}`);
    console.log(`  Client ID:  ${clientId}`);
    console.log(`  Expires:    ${expirationDate.toISOString().split('T')[0]} (${expiresDays} days)`);
    console.log('\n--- Add to backend/.env ---\n');
    console.log(`APPLE_CLIENT_ID=${clientId}`);
    console.log(`APPLE_CLIENT_SECRET=${secret}`);
    console.log('\n--- Secret only ---\n');
    console.log(secret);
    console.log('');
  } catch (error) {
    console.error('Error generating secret:', error.message);
    process.exit(1);
  }
}

main();

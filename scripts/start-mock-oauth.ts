#!/usr/bin/env tsx
/**
 * Start Mock OAuth Server
 *
 * This script starts a mock OAuth server for testing without real credentials.
 *
 * Usage:
 *   npm run mock-oauth
 *
 * Or directly:
 *   npx tsx scripts/start-mock-oauth.ts
 */

import { MockOAuthServer } from '../test-helpers/mock-oauth-server';

const server = new MockOAuthServer({ port: 9999 });

async function main() {
  try {
    await server.start();

    console.log('\n📋 Quick Start Guide:');
    console.log('  1. Keep this terminal open (mock OAuth server running)');
    console.log('  2. In another terminal, start the app: npm run dev');
    console.log('  3. Run Playwright tests that use OAuth');
    console.log('  4. Press Ctrl+C here to stop the mock server\n');
  } catch (error) {
    console.error('Failed to start mock OAuth server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down mock OAuth server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

main();

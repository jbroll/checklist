/**
 * Playwright Global Setup
 *
 * This runs once before all tests and starts the mock OAuth server.
 */

import { MockOAuthServer } from './test-helpers/mock-oauth-server';

let mockOAuthServer: MockOAuthServer | null = null;

async function globalSetup() {
  console.log('\n🚀 Starting global test setup...\n');

  // Start mock OAuth server
  mockOAuthServer = new MockOAuthServer({ port: 9999 });
  await mockOAuthServer.start();

  console.log('✅ Global setup complete\n');

  // Return teardown function
  return async () => {
    console.log('\n🧹 Running global teardown...\n');
    if (mockOAuthServer) {
      await mockOAuthServer.stop();
    }
    console.log('✅ Global teardown complete\n');
  };
}

export default globalSetup;

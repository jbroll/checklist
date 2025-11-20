/**
 * Mock Authentication Configuration for Testing
 *
 * This configuration swaps out Google OAuth with our mock OAuth server
 * for testing purposes.
 */

export const mockOAuthConfig = {
  // Mock OAuth provider configuration (mimics Google)
  mockGoogle: {
    clientId: 'mock-client-id',
    clientSecret: 'mock-client-secret',
    authorizationURL: 'http://localhost:9999/oauth/authorize',
    tokenURL: 'http://localhost:9999/oauth/token',
    userInfoURL: 'http://localhost:9999/oauth/userinfo',
    scope: 'openid profile email',
  },
};

/**
 * Environment variables for testing with mock OAuth
 */
export const getMockEnv = () => ({
  // Override Google OAuth to point to mock server
  GOOGLE_CLIENT_ID: mockOAuthConfig.mockGoogle.clientId,
  GOOGLE_CLIENT_SECRET: mockOAuthConfig.mockGoogle.clientSecret,

  // Use custom OAuth endpoints (if BetterAuth supports it)
  // Otherwise, we'd need to patch the OAuth configuration
  GOOGLE_AUTHORIZATION_URL: mockOAuthConfig.mockGoogle.authorizationURL,
  GOOGLE_TOKEN_URL: mockOAuthConfig.mockGoogle.tokenURL,
  GOOGLE_USERINFO_URL: mockOAuthConfig.mockGoogle.userInfoURL,

  // Keep existing config
  BASE_URL: process.env.BASE_URL || 'http://localhost:5173',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'test-secret-key',
  VITE_JAZZ_PEER: process.env.VITE_JAZZ_PEER,
});

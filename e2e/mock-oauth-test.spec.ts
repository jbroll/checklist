/**
 * Mock OAuth Server Tests
 *
 * These tests verify that the mock OAuth server is working correctly
 * and can be used for cross-device sync testing.
 *
 * The mock server runs on localhost:9999 and simulates Google OAuth.
 */

import { expect, test } from '@playwright/test';

test.describe('Mock OAuth Server', () => {
  test('should be running and accessible', async ({ request }) => {
    const response = await request.get('http://localhost:9999/health');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('mock-oauth-server');

    console.log('✅ Mock OAuth server is running');
  });

  test('should handle authorization flow', async ({ request }) => {
    // Test authorization endpoint
    const authResponse = await request.get('http://localhost:9999/oauth/authorize', {
      params: {
        client_id: 'mock-client-id',
        redirect_uri: 'http://localhost:5173/callback',
        state: 'test-state',
        scope: 'openid profile email',
      },
      maxRedirects: 0, // Don't follow redirects
    });

    // Should redirect (302)
    expect([302, 303, 307, 308]).toContain(authResponse.status());

    const location = authResponse.headers()['location'];
    expect(location).toContain('code=');
    expect(location).toContain('state=test-state');

    console.log('✅ Authorization endpoint working');
    console.log('   Redirect:', location);
  });

  test('should exchange code for tokens', async ({ request }) => {
    // First get an auth code
    const authResponse = await request.get('http://localhost:9999/oauth/authorize', {
      params: {
        client_id: 'mock-client-id',
        redirect_uri: 'http://localhost:5173/callback',
        state: 'test-state',
      },
      maxRedirects: 0,
    });

    const location = authResponse.headers()['location'];
    const url = new URL(location);
    const code = url.searchParams.get('code');

    expect(code).toBeTruthy();

    // Exchange code for token
    const tokenResponse = await request.post('http://localhost:9999/oauth/token', {
      form: {
        code: code!,
        grant_type: 'authorization_code',
        client_id: 'mock-client-id',
        client_secret: 'mock-client-secret',
        redirect_uri: 'http://localhost:5173/callback',
      },
    });

    expect(tokenResponse.ok()).toBe(true);

    const tokens = await tokenResponse.json();
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.id_token).toBeTruthy();

    console.log('✅ Token exchange working');
    console.log('   Access token:', tokens.access_token.substring(0, 20) + '...');
  });

  test('should fetch user info with token', async ({ request }) => {
    // Get auth code
    const authResponse = await request.get('http://localhost:9999/oauth/authorize', {
      params: {
        client_id: 'mock-client-id',
        redirect_uri: 'http://localhost:5173/callback',
        state: 'test',
      },
      maxRedirects: 0,
    });

    const location = authResponse.headers()['location'];
    const code = new URL(location).searchParams.get('code')!;

    // Get tokens
    const tokenResponse = await request.post('http://localhost:9999/oauth/token', {
      form: {
        code,
        grant_type: 'authorization_code',
        client_id: 'mock-client-id',
        client_secret: 'mock-client-secret',
      },
    });

    const tokens = await tokenResponse.json();

    // Fetch user info
    const userInfoResponse = await request.get('http://localhost:9999/oauth/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    expect(userInfoResponse.ok()).toBe(true);

    const userInfo = await userInfoResponse.json();
    expect(userInfo.email).toBe('test@example.com');
    expect(userInfo.name).toBe('Test User');
    expect(userInfo.sub).toBe('test-user-1');

    console.log('✅ User info endpoint working');
    console.log('   User:', userInfo.name, '<' + userInfo.email + '>');
  });

  test('should return same user info for same code', async ({ request }) => {
    // This verifies that the mock server is deterministic
    const authResponse1 = await request.get('http://localhost:9999/oauth/authorize', {
      params: { client_id: 'mock-client-id', redirect_uri: 'http://localhost:5173' },
      maxRedirects: 0,
    });

    const authResponse2 = await request.get('http://localhost:9999/oauth/authorize', {
      params: { client_id: 'mock-client-id', redirect_uri: 'http://localhost:5173' },
      maxRedirects: 0,
    });

    // Both should return same user (test-user-1)
    const code1 = new URL(authResponse1.headers()['location']).searchParams.get('code')!;
    const code2 = new URL(authResponse2.headers()['location']).searchParams.get('code')!;

    const tokens1 = await request.post('http://localhost:9999/oauth/token', {
      form: { code: code1, grant_type: 'authorization_code' },
    });

    const tokens2 = await request.post('http://localhost:9999/oauth/token', {
      form: { code: code2, grant_type: 'authorization_code' },
    });

    const userInfo1 = await request.get('http://localhost:9999/oauth/userinfo', {
      headers: { Authorization: `Bearer ${(await tokens1.json()).access_token}` },
    });

    const userInfo2 = await request.get('http://localhost:9999/oauth/userinfo', {
      headers: { Authorization: `Bearer ${(await tokens2.json()).access_token}` },
    });

    const user1 = await userInfo1.json();
    const user2 = await userInfo2.json();

    expect(user1.sub).toBe(user2.sub);
    expect(user1.email).toBe(user2.email);

    console.log('✅ Deterministic user assignment working');
  });
});

# Mock OAuth Testing Guide

## Overview

This project includes a **mock OAuth server** that runs on `localhost:9999` to simulate Google OAuth without requiring real credentials or internet connectivity. This makes testing cross-device sync fast, reliable, and completely offline.

## Why Mock OAuth?

✅ **No Real Credentials Needed** - No need to create test Google accounts
✅ **Fully Offline** - Works without internet connection
✅ **Deterministic** - Same user every time, perfect for testing
✅ **Fast** - No network latency or OAuth provider delays
✅ **CI-Friendly** - Can run in automated pipelines

## Quick Start

### 1. Start the Mock OAuth Server

In one terminal:
```bash
npm run mock-oauth
```

You should see:
```
🔐 Mock OAuth Server running on http://localhost:9999
   Users available for testing:
   - test@example.com (Test User)
   - test2@example.com (Test User 2)
```

**Keep this terminal open** - the server needs to run while you test.

### 2. Configure BetterAuth to Use Mock OAuth

**Option A: Environment Variables (Recommended)**

Create `.env.test`:
```env
# Mock OAuth endpoints
GOOGLE_CLIENT_ID=mock-client-id
GOOGLE_CLIENT_SECRET=mock-client-secret

# Other required vars
BASE_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
BETTER_AUTH_SECRET=test-secret-key
VITE_JAZZ_PEER=wss://cloud.jazz.tools
```

Then start your app using these vars:
```bash
# Load .env.test and start app
export $(cat .env.test | xargs) && npm run dev
```

**Option B: Modify BetterAuth Config (Temporary)**

In `backend/src/auth.ts`, temporarily replace Google OAuth with mock endpoints:

```typescript
socialProviders: {
  google: {
    clientId: 'mock-client-id',
    clientSecret: 'mock-client-secret',
    // Override OAuth endpoints
    authorizationURL: 'http://localhost:9999/oauth/authorize',
    tokenURL: 'http://localhost:9999/oauth/token',
    userInfoURL: 'http://localhost:9999/oauth/userinfo',
  },
},
```

**⚠️ Remember to revert this before committing!**

### 3. Run Your Tests

The mock server is now intercepting OAuth requests. When you click "Continue with Google":

1. Your app redirects to `http://localhost:9999/oauth/authorize`
2. Mock server **auto-approves** (no password needed!)
3. Redirects back with valid auth code
4. Your app exchanges code for tokens
5. BetterAuth creates session with `test@example.com`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your App (localhost:5173)               │
│                                                              │
│  [Continue with Google] ────────────────┐                   │
└──────────────────────────────────────────┼───────────────────┘
                                           │
                                           ▼
                     ┌──────────────────────────────────────┐
                     │  Mock OAuth Server (localhost:9999)  │
                     │                                       │
                     │  ✓ Auto-approve authorization        │
                     │  ✓ Return auth code                  │
                     │  ✓ Exchange code for tokens          │
                     │  ✓ Provide user info                 │
                     └──────────────────────────────────────┘
                                           │
                                           │ Returns tokens
                                           ▼
                     ┌──────────────────────────────────────┐
                     │  BetterAuth Backend (localhost:3001) │
                     │                                       │
                     │  ✓ Creates session                   │
                     │  ✓ Stores Jazz account keys          │
                     │  ✓ Sets cookies                      │
                     └──────────────────────────────────────┘
```

## Available Endpoints

The mock OAuth server exposes these endpoints:

### `GET /oauth/authorize`
Mimics Google's authorization endpoint.

**Parameters:**
- `client_id` - Any value (not validated)
- `redirect_uri` - Where to redirect after auth
- `state` - OAuth state parameter
- `scope` - Requested scopes

**Response:**
- 302 redirect to `redirect_uri` with `code` and `state`

**Example:**
```
GET http://localhost:9999/oauth/authorize?client_id=mock&redirect_uri=http://localhost:5173/callback&state=abc
→ Redirects to: http://localhost:5173/callback?code=dGVzdC11c2VyLTE6MTcwMQ==&state=abc
```

### `POST /oauth/token`
Exchanges authorization code for access token.

**Parameters (form-encoded):**
- `code` - Authorization code from `/authorize`
- `grant_type` - Must be `authorization_code`
- `client_id` - Any value
- `client_secret` - Any value

**Response:**
```json
{
  "access_token": "base64-encoded-token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "mock-refresh-token",
  "scope": "openid profile email",
  "id_token": "jwt-like-token"
}
```

### `GET /oauth/userinfo`
Returns user information.

**Headers:**
- `Authorization: Bearer {access_token}`

**Response:**
```json
{
  "sub": "test-user-1",
  "email": "test@example.com",
  "email_verified": true,
  "name": "Test User",
  "picture": "https://via.placeholder.com/150"
}
```

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "mock-oauth-server"
}
```

## Test Users

The mock server comes with two pre-configured test users:

### User 1 (Default)
- **ID:** `test-user-1`
- **Email:** `test@example.com`
- **Name:** Test User

### User 2
- **ID:** `test-user-2`
- **Email:** `test2@example.com`
- **Name:** Test User 2

**Note:** Currently, all requests use User 1. To add support for multiple users, you would need to modify the mock server to accept user selection.

## Testing Cross-Device Sync

With the mock OAuth server, you can easily test cross-device sync:

### Test Scenario: Same User on Two Devices

```bash
# Terminal 1: Start mock OAuth server
npm run mock-oauth

# Terminal 2: Start app
npm run dev
```

**Device A (Chrome):**
1. Open http://localhost:5173
2. Click "Continue with Google"
3. **Auto-signs in** as test@example.com
4. Create a folder: "SharedFolder"
5. Note account ID from console

**Device B (Chrome Incognito):**
1. Open http://localhost:5173
2. Click "Continue with Google"
3. **Auto-signs in** as same test@example.com
4. Account ID should **match Device A**
5. "SharedFolder" should **appear automatically**

✅ **This tests that cross-device sync is working!**

## Playwright Tests

### Running Tests with Mock OAuth

```bash
# Terminal 1: Start mock OAuth server
npm run mock-oauth

# Terminal 2: Run tests
npm run test:e2e
```

### Example Test

```typescript
test('should sync data across devices', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const deviceA = await contextA.newPage();
  const deviceB = await contextB.newPage();

  // Both devices sign in
  await deviceA.goto('/');
  await deviceA.getByRole('button', { name: /continue with google/i }).click();
  // Mock OAuth auto-approves and redirects back

  await deviceB.goto('/');
  await deviceB.getByRole('button', { name: /continue with google/i }).click();
  // Same user, same account ID

  // Create folder on Device A
  // ... folder creation code ...

  // Verify it appears on Device B
  // ... verification code ...
});
```

## Troubleshooting

### Mock server not responding

**Check if it's running:**
```bash
curl http://localhost:9999/health
```

**Expected response:**
```json
{"status":"ok","service":"mock-oauth-server"}
```

**If not running:**
- Make sure `npm run mock-oauth` is running in another terminal
- Check if port 9999 is already in use: `lsof -i :9999`

### OAuth still going to real Google

**Check BetterAuth configuration:**
- Verify `.env.test` has mock URLs
- Check `backend/src/auth.ts` isn't hardcoding Google URLs
- Restart backend after changing config

**Check browser:**
- Clear cookies and localStorage
- Hard refresh (Ctrl+Shift+R)

### "Invalid grant" error

**Cause:** The authorization code is invalid or expired.

**Solution:** The mock server codes are valid for the duration of the server run. Restart the mock server if you see this error frequently.

### Session not persisting

**Check database:**
```bash
cd backend
sqlite3 auth.db "SELECT id, email, accountID FROM user;"
```

**Should show:**
```
1|test@example.com|co_...
```

**If empty:**
- BetterAuth isn't receiving the OAuth callback
- Check backend logs for errors
- Verify `baseURL` and `trustedOrigins` in `backend/src/auth.ts`

## Advanced Usage

### Adding More Test Users

Edit `test-helpers/mock-oauth-server.ts`:

```typescript
this.users = config.users || [
  {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
  },
  {
    id: 'test-user-2',
    email: 'test2@example.com',
    name: 'Test User 2',
  },
  // Add more users
  {
    id: 'test-user-3',
    email: 'alice@example.com',
    name: 'Alice',
  },
];
```

Restart the mock server.

### Running on Different Port

```bash
PORT=8888 npm run mock-oauth
```

Then update your `.env.test` to point to `http://localhost:8888`.

### Using in CI/CD

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm install

      - name: Start mock OAuth server
        run: npm run mock-oauth &

      - name: Wait for mock OAuth
        run: npx wait-on http://localhost:9999/health

      - name: Run tests
        run: npm run test:e2e
        env:
          GOOGLE_CLIENT_ID: mock-client-id
          GOOGLE_CLIENT_SECRET: mock-client-secret
```

## Security Notes

⚠️ **Never use the mock OAuth server in production!**

The mock server:
- Has no authentication
- Has no rate limiting
- Has no validation
- Returns the same user for all requests
- Is designed ONLY for testing

## Comparison: Mock OAuth vs Real OAuth

| Feature                  | Mock OAuth                 | Real Google OAuth         |
|--------------------------|----------------------------|---------------------------|
| **Credentials needed**   | None                       | Google account required   |
| **Internet required**    | No                         | Yes                       |
| **Speed**                | Instant                    | 2-5 seconds              |
| **Deterministic**        | Always same user           | Depends on who signs in   |
| **CI/CD friendly**       | Yes                        | Requires test account     |
| **Multi-user testing**   | Hard (same user always)    | Easy (different accounts) |
| **Production ready**     | No - testing only          | Yes                       |

## Summary

✅ **Setup:** `npm run mock-oauth` (one command)
✅ **Fast:** No network delays
✅ **Reliable:** No OAuth provider outages
✅ **Offline:** Works without internet
✅ **Simple:** Auto-approves, no passwords

The mock OAuth server makes testing cross-device sync fast and reliable. For production, you'll still need real Google OAuth credentials, but for development and automated testing, the mock server is perfect!

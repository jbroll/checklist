# BubbleList OAuth Setup - Debugging Session Notes

**Date:** November 20-21, 2025
**Issue:** Google OAuth authentication not working in production

---

## Problem Summary

Google OAuth sign-in was failing in production with users never seeing the Google account selection screen and sessions not being created after OAuth callback.

## Root Causes Identified

### 1. **Service Worker Interference**
- **Problem:** Service worker was intercepting OAuth callback URLs and serving cached React app instead of letting callbacks reach the backend
- **Solution:** Disabled service worker in `vite.config.ts` with `injectRegister: false`
- **Impact:** Critical - callbacks were never reaching the backend

### 2. **Incomplete Database Schema**
- **Problem:** Manually created BetterAuth tables were missing required columns
- **Missing columns discovered:**
  - `user.accountID` - Required by Jazz plugin for storing Jazz account keys
  - `user.encryptedCredentials` - Required by BetterAuth
  - `account.idToken` - Required for OAuth token storage
  - `account.accessTokenExpiresAt` - Required for token expiry
  - `account.refreshTokenExpiresAt` - Required for refresh token expiry
- **Solution:** Created complete schema from working dev database

### 3. **Environment Variable Pollution**
- **Problem:** Claude's shell had `VITE_AUTH_URL=http://localhost:3001` set, causing production builds to use dev URLs
- **Solution:** Build with clean environment: `env -i HOME="$HOME" PATH="$PATH" NODE_ENV=production bash -c 'npm run build'`
- **Impact:** Production builds were pointing to localhost instead of production URL

### 4. **Missing BASE_URL in Backend**
- **Problem:** Systemd service didn't have `BASE_URL` environment variable set
- **Solution:** Added `Environment=BASE_URL=https://bubblelist.rkroll.com` to `/etc/systemd/system/bubblelist-api.service`
- **Impact:** OAuth callbacks were returning 404

---

## Complete BetterAuth Database Schema

The correct schema that BetterAuth requires (extracted from working dev database):

```sql
CREATE TABLE IF NOT EXISTS "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" integer not null,
  "image" text,
  "createdAt" date not null,
  "updatedAt" date not null,
  "accountID" text,                    -- Jazz plugin requirement
  "encryptedCredentials" text          -- BetterAuth requirement
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text not null primary key,
  "expiresAt" date not null,
  "token" text not null unique,
  "createdAt" date not null,
  "updatedAt" date not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,                      -- OAuth token storage
  "accessTokenExpiresAt" date,         -- Token expiry
  "refreshTokenExpiresAt" date,        -- Refresh token expiry
  "scope" text,
  "password" text,
  "createdAt" date not null,
  "updatedAt" date not null
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" date not null,
  "createdAt" date not null,
  "updatedAt" date not null
);
```

---

## BetterAuth CLI Migration

BetterAuth provides a CLI tool for schema management:

```bash
# Install and run migrations
npx @better-auth/cli migrate -y

# Check available commands
npx @better-auth/cli --help
```

**Note:** We manually created the schema instead of using migrations because BetterAuth doesn't auto-create tables - migrations must be run explicitly.

---

## Files Modified

### Backend Files

**`/home/john/src/bubblelist/backend/src/auth.ts`**
- Changed `sameSite: "none"` to `sameSite: "lax"` for same-domain OAuth
- Added `path: "/"` to ensure cookies accessible across domain
- Configuration:
  ```typescript
  defaultCookieAttributes: {
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: "/",
  }
  ```

**`/home/john/src/bubblelist/backend/src/index.ts`**
- Removed manual table creation code
- BetterAuth tables should be created via migrations or manual SQL
- Lines 29-31: Simplified to just log message

**`/home/john/src/bubblelist/backend/src/migrate-auth.ts`**
- Updated with complete schema including all required columns
- This file can be used for future database resets

**`/etc/systemd/system/bubblelist-api.service` (on production server)**
- Added: `Environment=BASE_URL=https://bubblelist.rkroll.com`
- Required for OAuth callback URL generation

### Frontend Files

**`/home/john/src/bubblelist/src/components/AuthGate.tsx`**
- Lines 127-141: Updated `handleGoogleSignIn` to call `betterAuthClient.signIn.social()` without awaiting
- Removed manual redirect logic - let BetterAuth handle it

**`/home/john/src/bubblelist/vite.config.ts`**
- Disabled service worker: `injectRegister: false` in VitePWA config
- Critical for OAuth callbacks to reach backend

**`/home/john/src/bubblelist/.env.production`**
- Contains: `VITE_AUTH_URL=https://bubblelist.rkroll.com`
- Must be used with clean environment during build

---

## Build and Deploy Process

### Clean Build (Critical!)

```bash
# Build with clean environment to avoid variable pollution
env -i HOME="$HOME" PATH="$PATH" NODE_ENV=production bash -c 'npm run build'

# Verify production URL in built files
grep -o 'KQ="[^"]*"' dist/assets/index-*.js | grep -v TestPage | head -1
# Should output: dist/assets/index-*.js:KQ="https://bubblelist.rkroll.com"
```

### Deploy Frontend

```bash
rsync -avz --delete dist/ john@bubblelist.rkroll.com:/var/www/bubblelist/
```

### Deploy Backend

```bash
cd backend
npm run build
/home/john/src/deploy.sh/deploy.sh update
```

---

## Database Setup on Production

**IMPORTANT: Database Location Changed (Nov 21, 2025)**

The database has been moved from `/var/lib/bubblelist-api/data/auth.db` to `/var/lib/bubblelist-api-data/auth.db` to prevent deletion during deployments. The deployment system uses `rsync --delete` which was deleting the database on every deployment.

**Current database path:** `/var/lib/bubblelist-api-data/auth.db`

The backend now uses the `AUTH_DB_PATH` environment variable to locate the database. This is set in the systemd service to `/var/lib/bubblelist-api-data/auth.db`.

### Apply Complete Schema

```bash
ssh john@bubblelist.rkroll.com "sudo sqlite3 /var/lib/bubblelist-api-data/auth.db" <<'EOF'
CREATE TABLE IF NOT EXISTS "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "accountID" text, "encryptedCredentials" text);
CREATE TABLE IF NOT EXISTS "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
CREATE TABLE IF NOT EXISTS "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE IF NOT EXISTS "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
EOF
```

### Verify Schema

```bash
ssh john@bubblelist.rkroll.com "sudo sqlite3 /var/lib/bubblelist-api-data/auth.db '.tables'"
# Should show: account  session  share_invites  user  verification

ssh john@bubblelist.rkroll.com "sudo sqlite3 /var/lib/bubblelist-api-data/auth.db '.schema account'"
# Verify all columns including idToken, accessTokenExpiresAt, refreshTokenExpiresAt
```

---

## Debugging Commands

### Backend Logs

```bash
# Recent logs
ssh john@bubblelist.rkroll.com "sudo journalctl -u bubblelist-api -n 100 --no-pager"

# Look for errors
ssh john@bubblelist.rkroll.com "sudo journalctl -u bubblelist-api -n 100 --no-pager | grep -i error"

# OAuth callback errors
ssh john@bubblelist.rkroll.com "sudo journalctl -u bubblelist-api --since '5 minutes ago' --no-pager | grep -B5 -A5 'callback'"
```

### Apache Logs

```bash
# Access logs
ssh john@bubblelist.rkroll.com "sudo tail -50 /var/log/apache2/bubblelist_access.log"

# OAuth callback requests (should see 302 redirects)
ssh john@bubblelist.rkroll.com "sudo tail -100 /var/log/apache2/bubblelist_access.log | grep 'callback/google'"
```

### Database Inspection

```bash
# Check if users exist
ssh john@bubblelist.rkroll.com "sudo sqlite3 /var/lib/bubblelist-api-data/auth.db 'SELECT id, email, name, accountID FROM user'"

# Check sessions
ssh john@bubblelist.rkroll.com "sudo sqlite3 /var/lib/bubblelist-api-data/auth.db 'SELECT id, userId, expiresAt FROM session'"

# Check accounts
ssh john@bubblelist.rkroll.com "sudo sqlite3 /var/lib/bubblelist-api-data/auth.db 'SELECT id, userId, providerId FROM account'"
```

---

## OAuth Flow Sequence (Expected)

1. User clicks "Continue with Google" in frontend
2. Frontend calls `betterAuthClient.signIn.social({ provider: 'google', callbackURL: '/' })`
3. Browser navigates to Google OAuth: `https://accounts.google.com/o/oauth2/auth?...`
4. User sees Google account selection screen (if not auto-approved)
5. Google redirects to: `https://bubblelist.rkroll.com/api/auth/callback/google?state=...&code=...`
6. Backend BetterAuth handler:
   - Validates state parameter
   - Exchanges code for tokens
   - Creates/updates user record with Jazz accountID
   - Creates account record with OAuth tokens
   - Creates session record
   - Sets session cookie
   - Redirects to callbackURL (/)
7. Frontend loads and checks session
8. User is authenticated

---

## Common Errors and Solutions

### Error: `SqliteError: table user has no column named accountID`
- **Cause:** Missing Jazz plugin column
- **Solution:** Add `accountID TEXT` column to user table

### Error: `SqliteError: table user has no column named encryptedCredentials`
- **Cause:** Missing BetterAuth column
- **Solution:** Add `encryptedCredentials TEXT` column to user table

### Error: `SqliteError: table account has no column named idToken`
- **Cause:** Incomplete account table schema
- **Solution:** Add `idToken TEXT`, `accessTokenExpiresAt DATE`, `refreshTokenExpiresAt DATE` columns

### Error: `unable_to_link_account`
- **Cause:** Missing columns in account table
- **Solution:** Apply complete schema with all columns

### Error: `GET /api/auth/callback/google` returns 404
- **Cause:** Backend doesn't have BASE_URL set
- **Solution:** Add BASE_URL to systemd service environment

### Service Worker Intercepting Callbacks
- **Symptom:** Callback URL loads React app instead of hitting backend
- **Solution:**
  1. Disable service worker in vite.config.ts: `injectRegister: false`
  2. Unregister existing service workers in browser DevTools
  3. Hard refresh (Ctrl+Shift+R)

---

## Testing Checklist

- [ ] Service worker disabled (check DevTools → Application → Service Workers)
- [ ] Database has all required tables and columns
- [ ] Backend has BASE_URL environment variable set
- [ ] Frontend built with clean environment (no VITE_AUTH_URL pollution)
- [ ] Google OAuth credentials configured in .env
- [ ] Redirect URI in Google Console: `https://bubblelist.rkroll.com/api/auth/callback/google`
- [ ] Backend logs show no "no such table" or "no such column" errors
- [ ] Apache logs show 302 redirect from callback endpoint (not 404)

---

## Current Status

**Database Schema:** ✅ Complete - all required columns present
**Service Worker:** ✅ Disabled
**Environment Variables:** ✅ Clean builds configured
**Backend Configuration:** ✅ BASE_URL set in systemd service
**OAuth Flow:** ⏳ Ready for testing

**Next Step:** Test Google OAuth sign-in flow end-to-end

---

## References

- BetterAuth Documentation: https://better-auth.com/docs
- Jazz.tools Documentation: https://jazz.tools/docs
- BetterAuth CLI: `npx @better-auth/cli --help`
- BetterAuth Migrations: `npx @better-auth/cli migrate -y`

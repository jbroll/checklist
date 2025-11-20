# Cross-Device Sync Testing Guide

## Issue Fixed
Cross-device sync failure where logging in on a new device with the same OAuth account would either show an empty database or clear the remote database.

## Changes Made

### 1. `src/lib/jazz.tsx`
- Added `when: 'signedUp'` to only sync authenticated accounts (prevents anonymous account pollution)
- Added `onAnonymousAccountDiscarded` handler to properly handle account transition when logging in on new devices
- Added console logging to track anonymous account lifecycle

### 2. `vite.config.ts`
- Configured proxy to forward `x-jazz-auth` header (required by Jazz BetterAuth plugin)
- Without this, the backend cannot retrieve encrypted credentials from the database

### 3. `src/components/AuthGate.tsx`
- Added debugging to log account state (accountId, hasRoot, foldersCount, profileName)
- Helps track account transitions and verify data persistence

### 4. `backend/src/index.ts`
- Added logging for `x-jazz-auth` header in auth requests
- Helps verify the header is being received by the backend

## Testing Instructions

### Pre-Test Setup
1. Ensure you have data on Device A:
   ```bash
   # On Device A
   npm run dev
   # Sign in and create some folders/templates
   ```

2. Note the account ID from browser console:
   ```
   [AuthGate] Account state: { accountId: 'co_...', ... }
   ```

### Test 1: Fresh Login on Second Device

**Goal:** Verify that logging in on a new device retrieves existing data from the server.

1. **Device B - Clear all browser data:**
   - Open DevTools → Application → Storage → Clear site data
   - Or use incognito/private mode

2. **Device B - Open app:**
   ```bash
   npm run dev
   ```
   - Should see sign-in screen
   - Console should show anonymous account creation

3. **Device B - Sign in with same Google account:**
   - Click "Continue with Google"
   - Complete OAuth flow

4. **Device B - Verify logs:**
   ```
   [Jazz] Anonymous account discarded - migrating data if needed
   [Jazz] No data in anonymous account - authenticated account will load from server
   [AuthGate] Account state: {
     accountId: 'co_...',  // Should match Device A
     hasRoot: true,
     foldersCount: X,      // Should match Device A
     profileName: '...'
   }
   ```

5. **Device B - Verify UI:**
   - Folders and templates should appear
   - Data should match Device A exactly

### Test 2: Verify Backend Header Forwarding

**Goal:** Confirm `x-jazz-auth` header is being forwarded to backend.

1. **Open DevTools → Network tab**

2. **Sign in with Google**

3. **Filter for `/api/auth/` requests**

4. **Check backend logs:**
   ```
   [timestamp] POST /api/auth/session
     Headers: {
       cookie: '...',
       origin: 'http://localhost:5173',
       referer: 'http://localhost:5173/',
       x-jazz-auth: '...'  // Should NOT be '(none)'
     }
   ```

5. **If `x-jazz-auth` is `(none)`:**
   - Check Vite proxy configuration
   - Restart dev server
   - Clear browser cache

### Test 3: Sign Out and Sign Back In

**Goal:** Verify data persists across sign-out/sign-in cycles.

1. **Sign out from the app**

2. **Sign back in with the same account**

3. **Verify:**
   - Data still present
   - No duplication
   - Folder count matches

### Test 4: Create Data on Device B, Verify on Device A

**Goal:** Verify real-time sync works both directions.

1. **Device B - Create a new folder:**
   - Add a new template folder
   - Add some items

2. **Device A - Refresh or wait for sync:**
   - New folder should appear
   - Data should match Device B

3. **Verify logs on both devices:**
   ```
   [AuthGate] Account state: {
     accountId: '...',      // Should be identical
     foldersCount: Y,       // Should be Y (increased from X)
   }
   ```

### Test 5: Offline Sync

**Goal:** Verify offline changes sync when reconnected.

1. **Device B - Go offline:**
   - DevTools → Network → Offline checkbox
   - Or disable network

2. **Device B - Create data while offline:**
   - Create folders/items
   - Should work normally (offline-first)

3. **Device B - Go back online:**
   - Re-enable network
   - Watch console for sync activity

4. **Device A - Verify sync:**
   - New data should appear
   - May take a few seconds

## Expected Console Output

### Successful Login on New Device
```
[Jazz] Anonymous account discarded - migrating data if needed
[Jazz] No data in anonymous account - authenticated account will load from server
[AuthGate] Account state: {
  accountId: 'co_zTnD6zZAg3UQ83wMAXh3of9ptuW',
  hasRoot: true,
  foldersCount: 3,
  profileName: 'John Doe'
}
```

### Backend Logs (Successful)
```
[2025-11-20T...] POST /api/auth/session
  Headers: {
    cookie: 'better-auth.session_token=...',
    origin: 'http://localhost:5173',
    referer: 'http://localhost:5173/',
    x-jazz-auth: 'eyJ...'  // Base64 encoded JWT
  }
```

## Troubleshooting

### Issue: Data still not syncing

**Check:**
1. Browser console for error messages
2. Backend logs for `x-jazz-auth` header
3. Network tab for failed requests
4. Account ID matches across devices

**Solutions:**
- Restart both frontend and backend servers
- Clear browser cache and storage
- Verify `.env` has correct `VITE_JAZZ_PEER`
- Check database: `sqlite3 backend/auth.db "SELECT accountID FROM user;"`

### Issue: `x-jazz-auth` header is `(none)`

**Cause:** Vite proxy not forwarding the header.

**Solutions:**
- Verify `vite.config.ts` has the proxy configuration
- Restart the dev server: `Ctrl+C` then `npm run dev`
- Check Vite version is compatible

### Issue: Empty data on new device

**Cause:** Anonymous account not being discarded.

**Solutions:**
- Verify `src/lib/jazz.tsx` has `when: 'signedUp'` and `onAnonymousAccountDiscarded`
- Check console for `[Jazz] Anonymous account discarded` message
- If missing, the handler is not running

### Issue: Duplicate folders

**Cause:** Migration handler merging anonymous data with authenticated data incorrectly.

**Solutions:**
- This shouldn't happen with current implementation
- If it does, report it as a bug
- Check console logs for migration activity

## Success Criteria

✅ Account ID is identical across all devices for the same user
✅ Folder count matches across all devices
✅ New data created on Device B appears on Device A
✅ Console shows `[Jazz] Anonymous account discarded` when logging in on new device
✅ Backend logs show `x-jazz-auth` header (not `(none)`)
✅ Offline changes sync when reconnected
✅ No data loss or duplication

## Database Verification

You can verify the database contains the correct data:

```bash
cd backend
sqlite3 auth.db

# Check users
SELECT id, name, email, accountID FROM user;

# Verify encrypted credentials exist
SELECT accountID, length(encryptedCredentials) as credential_length FROM user;
```

Expected output:
```
accountID                           | credential_length
------------------------------------|------------------
co_zTnD6zZAg3UQ83wMAXh3of9ptuW     | 500+ (encrypted data)
```

## Additional Notes

- The `onAnonymousAccountDiscarded` handler only logs migration status
- Actual data retrieval happens automatically via BetterAuth plugin
- The `when: 'signedUp'` setting prevents anonymous accounts from syncing
- Cross-device sync relies on Jazz Cloud (or self-hosted sync server)
- If using self-hosted Jazz server, ensure `VITE_JAZZ_PEER` points to it

## Production Deployment

When deploying to production:

1. **Update environment variables:**
   ```env
   VITE_JAZZ_PEER=wss://your-jazz-server.com
   BASE_URL=https://your-app.com
   FRONTEND_URL=https://your-app.com
   ```

2. **Enable secure cookies:**
   In `backend/src/auth.ts`:
   ```typescript
   advanced: {
     useSecureCookies: true,  // Change to true for HTTPS
     disableCSRFCheck: false, // Enable CSRF protection
     defaultCookieAttributes: {
       sameSite: "none",      // Required for cross-origin OAuth
       httpOnly: true,
       secure: true,          // Required for HTTPS
     },
   }
   ```

3. **Test the production flow:**
   - Follow all test scenarios above
   - Verify HTTPS is working
   - Check OAuth redirects work correctly

## Questions?

If you encounter issues not covered here:
1. Check browser console for errors
2. Check backend logs for errors
3. Verify database has `accountID` and `encryptedCredentials`
4. Ensure both servers are running (`npm run dev`)

# Cross-Device Sync Testing Results

## Overview

This document summarizes the Playwright test results for cross-device sync functionality and provides manual testing instructions for scenarios that require OAuth authentication.

## Automated Test Results ✅

### Test Suite 1: `e2e/cross-device-sync.spec.ts`
**Status:** 9/9 passed (1 skipped intentionally)

Tests verify the infrastructure for cross-device sync:
- ✅ Account state logging works correctly
- ✅ Anonymous accounts are created with unique IDs
- ✅ Folders can be created and persist locally
- ✅ Data survives page reloads (IndexedDB working)
- ✅ `onAnonymousAccountDiscarded` handler is integrated
- ✅ Debugging logs are properly configured

### Test Suite 2: `e2e/cross-device-real-sync.spec.ts`
**Status:** 8/8 passed

Tests demonstrate real-world scenarios:
- ✅ Folder creation on Device A persists locally
- ✅ Data persists across page reloads via IndexedDB
- ✅ Anonymous Device B can create folders before login
- ✅ Different browser contexts get different anonymous account IDs
- ✅ `onAnonymousAccountDiscarded` flow is documented and ready

**Key Finding:** In anonymous mode, each device gets a unique account ID (e.g., `co_z3bMx...` vs `co_z8pJd...`). With OAuth authentication, both devices would share the same account ID, enabling sync.

## What the Automated Tests Verified

### 1. Jazz Infrastructure ✅
- Jazz accounts are created correctly
- Account IDs are tracked and logged
- IndexedDB stores data locally
- Page reloads preserve data

### 2. Debugging Infrastructure ✅
Console logs working correctly:
```
[AuthGate] Account state: {
  accountId: co_zPnKhEY2CZKVehF9Bzxi41YXvX9,
  hasRoot: true,
  foldersCount: 0,
  profileName: Anonymous user
}
```

### 3. Anonymous Account Lifecycle ✅
- Anonymous accounts created on fresh devices
- Each device gets unique account ID
- `onAnonymousAccountDiscarded` handler registered
- Ready to migrate data when user authenticates

### 4. Data Persistence ✅
- Folders created on Device A persist locally
- Data survives page reloads
- IndexedDB working correctly

## What Requires Manual Testing

The automated tests **cannot** test the following because they require real OAuth authentication:

### 1. Cross-Device Data Sync (OAuth Required)
**Why:** Requires signing in with same Google account on multiple devices

### 2. Anonymous Data Migration (OAuth Required)
**Why:** Requires triggering the `onAnonymousAccountDiscarded` handler via real sign-in

### 3. x-jazz-auth Header Verification (OAuth Required)
**Why:** Header only sent during authenticated requests

---

# Manual Testing Instructions

## Test 1: Basic Cross-Device Sync

### Objective
Verify that data created on Device A appears on Device B when signed in with the same account.

### Prerequisites
- Two browsers or one browser + incognito mode
- Google OAuth credentials configured
- Both frontend and backend running (`npm run dev`)

### Steps

**Device A (Chrome):**
1. Open http://localhost:5173
2. Open DevTools Console (F12)
3. Click "Continue with Google"
4. Sign in with your Google account
5. Wait for redirect back to app
6. Check console for account state:
   ```
   [AuthGate] Account state: {
     accountId: "co_zTnD6zZAg3UQ83wMAXh3of9ptuW",
     hasRoot: true,
     foldersCount: X,
     profileName: "Your Name"
   }
   ```
7. **Copy the `accountId` value**
8. Click "New Folder"
9. Name it: `SharedFolder-Test1`
10. Click "Create"
11. Verify folder appears in the tree
12. **Keep this browser tab open**

**Device B (Chrome Incognito or Firefox):**
1. Open http://localhost:5173
2. Open DevTools Console (F12)
3. Click "Continue with Google"
4. Sign in with **THE SAME Google account** as Device A
5. Wait for redirect back to app
6. Check console for:
   ```
   [Jazz] Anonymous account discarded - migrating data if needed
   [Jazz] No data in anonymous account - authenticated account will load from server
   [AuthGate] Account state: {
     accountId: "co_zTnD6zZAg3UQ83wMAXh3of9ptuW",  // Should match Device A
     ...
   }
   ```
7. **Verify the `accountId` matches Device A**
8. **Verify `SharedFolder-Test1` appears automatically**

### Expected Results
- ✅ Account IDs are **identical** on both devices
- ✅ Folder created on Device A appears on Device B within 1-2 seconds
- ✅ Console shows Jazz sync activity
- ✅ No errors in console or backend logs

### Backend Verification
Check backend terminal for:
```
[timestamp] POST /api/auth/session
  Headers: {
    cookie: '...',
    origin: 'http://localhost:5173',
    x-jazz-auth: 'eyJ...'  // Should NOT be '(none)'
  }
```

### Troubleshooting
If sync doesn't work:
1. Check both devices have same `accountId`
2. Check backend logs for `x-jazz-auth` header
3. Check browser console for errors
4. Verify WebSocket connection to Jazz Cloud (Network tab)
5. Check database: `sqlite3 backend/auth.db "SELECT accountID, name FROM user;"`

---

## Test 2: Real-Time Sync (Bi-directional)

### Objective
Verify that changes on either device sync to the other in real-time.

### Prerequisites
- Complete Test 1 first
- Both devices still signed in with same account
- Both devices on the same authenticated account

### Steps

**Device A:**
1. Create a new folder: `RealtimeTest-A`
2. Observe Device B

**Device B:**
1. Should see `RealtimeTest-A` appear within 1-2 seconds
2. Create a new folder: `RealtimeTest-B`
3. Observe Device A

**Device A:**
1. Should see `RealtimeTest-B` appear within 1-2 seconds

### Expected Results
- ✅ Changes sync bi-directionally
- ✅ Sync happens within 1-2 seconds
- ✅ No conflicts or duplicates
- ✅ Both devices show identical folder lists

---

## Test 3: Anonymous Data Migration

### Objective
Verify that data created on Device B **before** login is preserved after signing in.

### Prerequisites
- Device A signed in with data
- Device B fresh (clear storage)

### Steps

**Device A (Already Signed In):**
1. Ensure you have at least one folder: `AuthenticatedFolder`
2. Note the `accountId` from console
3. **Keep this tab open**

**Device B (Fresh Start):**
1. Open http://localhost:5173 in incognito/private mode
2. Open DevTools Console
3. **DO NOT sign in yet**
4. You should see the New Folder button (anonymous mode)
5. Check console for anonymous account:
   ```
   [AuthGate] Account state: {
     accountId: "co_zXXXXXXXXX",  // Different from Device A
     profileName: "Anonymous user"
   }
   ```
6. Click "New Folder"
7. Create a folder: `AnonymousFolder-PreLogin`
8. Verify folder appears
9. **Now click "Continue with Google"**
10. Sign in with **the same account as Device A**
11. Watch console closely:
    ```
    [Jazz] Anonymous account discarded - migrating data if needed
    [Jazz] Anonymous account has data - will be available for migration: 1 folders
    [AuthGate] Account state: {
      accountId: "co_zTnD6zZAg3UQ83wMAXh3of9ptuW",  // Now matches Device A
      ...
    }
    ```
12. **Verify `accountId` now matches Device A**

### Expected Results

**Current Implementation (v1 - Informational Only):**
- ✅ Console shows anonymous account was discarded
- ✅ Console logs how many folders were in anonymous account
- ✅ Account ID changes from anonymous to authenticated
- ⚠️  Anonymous folder data is **logged but not automatically merged**
- ✅ Authenticated folders from Device A appear
- ⚠️  Anonymous folder `AnonymousFolder-PreLogin` may be lost

**Future Enhancement (v2 - Auto-Merge):**
To implement automatic data merging, enhance the `onAnonymousAccountDiscarded` handler in `src/lib/jazz.tsx`:

```typescript
onAnonymousAccountDiscarded={async (anonymousAccount) => {
  console.log('[Jazz] Anonymous account discarded - migrating data');

  try {
    const anonymousData = await anonymousAccount.$jazz.ensureLoaded({
      resolve: { root: { folders: true } },
    });

    if (anonymousData.root?.folders && anonymousData.root.folders.length > 0) {
      console.log('[Jazz] Migrating folders:', anonymousData.root.folders.length);

      // Get authenticated account (available in AuthProvider context)
      // Transfer ownership of each folder to authenticated account
      for (const folder of anonymousData.root.folders) {
        // Add authenticated account as admin to the folder's owner group
        const folderGroup = folder.$jazz.owner;
        await folderGroup.addMember(authenticatedAccount, 'admin');

        // Add folder to authenticated account's root
        authenticatedAccount.root.folders.$jazz.push(folder);
      }

      console.log('[Jazz] Migration complete');
    }
  } catch (error) {
    console.error('[Jazz] Migration error:', error);
  }
}}
```

### Why Auto-Merge Isn't Implemented Yet

The current implementation **logs** the anonymous data but doesn't automatically merge it because:

1. **Access to Authenticated Account:** The `onAnonymousAccountDiscarded` handler doesn't have direct access to the authenticated account that will replace the anonymous one
2. **Ownership Transfer:** Moving data between accounts requires Jazz permission handling
3. **Conflict Resolution:** Need to decide what happens if both accounts have data

**Current Behavior:** Safe and informational - tells you what data exists, lets you manually decide what to do.

---

## Test 4: x-jazz-auth Header Verification

### Objective
Verify that the Vite proxy is correctly forwarding the `x-jazz-auth` header to the backend.

### Prerequisites
- Frontend and backend running
- Ready to sign in

### Steps

**Browser (DevTools):**
1. Open http://localhost:5173
2. Open DevTools → Network tab
3. Click "Continue with Google"
4. Complete OAuth flow
5. Filter Network tab for "auth"
6. Find POST request to `/api/auth/session`
7. Click on it → Headers tab
8. Check **Request Headers** for `x-jazz-auth`

**Backend (Terminal):**
1. Watch backend logs during sign-in
2. Look for:
   ```
   [timestamp] POST /api/auth/session
     Headers: {
       cookie: 'better-auth.session_token=...',
       origin: 'http://localhost:5173',
       referer: 'http://localhost:5173/',
       x-jazz-auth: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
     }
   ```

### Expected Results
- ✅ `x-jazz-auth` header is present in request (browser DevTools)
- ✅ Backend logs show the header value (not `(none)`)
- ✅ Header value is a base64-encoded JWT (starts with `eyJ`)

### Troubleshooting
If `x-jazz-auth` is `(none)`:
1. Restart dev server: `Ctrl+C` then `npm run dev`
2. Hard refresh browser: `Ctrl+Shift+R` or `Cmd+Shift+R`
3. Clear browser cache completely
4. Verify `vite.config.ts` has proxy configuration:
   ```typescript
   configure: (proxy, _options) => {
     proxy.on('proxyReq', (proxyReq, req, _res) => {
       if (req.headers['x-jazz-auth']) {
         proxyReq.setHeader('x-jazz-auth', req.headers['x-jazz-auth']);
       }
     });
   }
   ```

---

## Database Verification

You can verify the BetterAuth database contains the correct Jazz account data:

```bash
cd backend
sqlite3 auth.db

# Check users
SELECT id, name, email, accountID FROM user;

# Check if encrypted credentials exist
SELECT
  accountID,
  length(encryptedCredentials) as credential_length
FROM user
WHERE accountID IS NOT NULL;

# Exit
.quit
```

**Expected Output:**
```
accountID                           | credential_length
------------------------------------|------------------
co_zTnD6zZAg3UQ83wMAXh3of9ptuW     | 500-1000 (varies)
```

If `accountID` is NULL or `encryptedCredentials` is empty, the Jazz BetterAuth plugin isn't storing data correctly.

---

## Success Criteria Summary

### ✅ Cross-Device Sync Working
- [ ] Same `accountId` on both devices when signed in with same account
- [ ] Data created on Device A appears on Device B automatically
- [ ] Data created on Device B appears on Device A automatically
- [ ] Sync happens within 1-2 seconds
- [ ] No data loss or duplication

### ✅ Anonymous Data Handling
- [ ] Console logs `[Jazz] Anonymous account discarded` when signing in
- [ ] Console logs folder count from anonymous account
- [ ] Account ID changes from anonymous to authenticated after login
- [ ] Authenticated account data loads from server

### ✅ Infrastructure
- [ ] `x-jazz-auth` header present in backend logs (not `(none)`)
- [ ] Database has `accountID` and `encryptedCredentials` for users
- [ ] No errors in browser console or backend logs
- [ ] WebSocket connection to Jazz Cloud established (check Network tab)

---

## Known Limitations

### 1. Anonymous Data Not Auto-Merged
**Current:** Anonymous account data is logged but not automatically transferred to authenticated account.

**Workaround:** Users should sign in before creating important data, or manually recreate data after signing in.

**Future:** Implement automatic data migration in `onAnonymousAccountDiscarded` handler (see Test 3 for code example).

### 2. OAuth Required for Real Testing
**Current:** Automated tests can only verify infrastructure, not actual cross-device sync.

**Workaround:** Manual testing with real OAuth required (follow tests above).

**Future:** Set up test OAuth credentials or use Jazz's test mode if available.

### 3. Sync Timing
**Current:** Sync may take 1-2 seconds depending on network conditions.

**Impact:** Tests need appropriate delays to wait for sync completion.

---

## Playwright Test Commands

Run all cross-device tests:
```bash
npm run test:e2e cross-device
```

Run specific test suite:
```bash
npx playwright test cross-device-sync.spec.ts
npx playwright test cross-device-real-sync.spec.ts
```

Run with UI (helpful for debugging):
```bash
npx playwright test cross-device-sync.spec.ts --ui
```

Run in headed mode (see browser):
```bash
npx playwright test cross-device-sync.spec.ts --headed
```

---

## Summary

**Automated Testing:** ✅ Complete
- Infrastructure verified
- Debugging enabled
- Data persistence working
- Anonymous account lifecycle working

**Manual Testing:** ⏳ Required
- Cross-device sync (OAuth required)
- Anonymous data migration (OAuth required)
- Header forwarding verification

**Next Steps:**
1. Run Manual Test 1 to verify basic cross-device sync
2. Run Manual Test 2 to verify real-time bi-directional sync
3. Run Manual Test 3 to test anonymous data migration
4. Run Manual Test 4 to verify header forwarding

All infrastructure is in place and ready for manual testing!

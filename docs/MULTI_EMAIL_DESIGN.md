# Multi-Email Account Design

Allow multiple email addresses to access the same Bubblelist account by creating duplicate `user` rows that share the same Jazz `accountID` and `encryptedCredentials`.

## Database Model

### Existing `user` Table (unchanged)
```
id | email (unique) | accountID | encryptedCredentials | ...
```

### New `email_verification` Table
```
token TEXT PRIMARY KEY
source_user_id TEXT NOT NULL     -- user initiating verification
target_email TEXT NOT NULL       -- email being verified
expires_at INTEGER NOT NULL
created_at INTEGER NOT NULL
```

## Core Flows

### Flow 1: Add Verified Email from Profile

1. User logged in as `alice@gmail.com` (user row exists with `accountID=co_abc`)
2. User clicks "Add Verified Email", enters `alice@work.com`
3. Backend checks `alice@work.com` not already in `user` table
4. Backend creates `email_verification` row: `{token, source_user_id, target_email, expires_at}`
5. Backend sends verification email to `alice@work.com` with link containing token
6. User clicks link (must be logged in as `alice@gmail.com`)
7. Backend verifies: token valid, not expired, logged-in user matches `source_user_id`
8. Backend creates new `user` row:
   - `email = alice@work.com`
   - `accountID = co_abc` (copied from source)
   - `encryptedCredentials = ...` (copied from source)
9. User can now sign in with either email, both load same Jazz account

### Flow 2: Share Link Email Mismatch

1. Share sent to `bob@work.com`
2. User clicks share link while logged in as `bob@gmail.com`
3. Backend detects mismatch: share recipient != logged-in email
4. Frontend shows: "This share was sent to bob@work.com. Verify you control this email to accept."
5. User clicks verify button
6. Proceeds as Flow 1 steps 4-9, with share acceptance after verification

## API Endpoints

### `POST /api/email-verification/request`
- Auth: Required
- Body: `{ email: string }`
- Validates email not already registered
- Creates verification token (24h expiry)
- Sends verification email
- Returns: `{ success: true }`

### `POST /api/email-verification/confirm`
- Auth: Required
- Body: `{ token: string }`
- Validates token, expiry, and user match
- Creates duplicate `user` row with shared Jazz credentials
- Deletes verification token
- Returns: `{ success: true, email: string }`

### `GET /api/user/linked-emails`
- Auth: Required
- Returns all emails sharing the same `accountID`
- Used to display linked emails in profile

## Share Matching Update

Current share logic checks: `recipient_email == logged_in_user.email`

Updated logic:
```
SELECT 1 FROM user
WHERE email = :recipient_email
AND accountID = :logged_in_user_accountID
```

If match found, user can access the share regardless of which linked email they're logged in with.

## Migration Strategy: Merging Existing Accounts

When a user tries to verify an email that already has its own Bubblelist account with data.

### Detection
During verification request, check if `target_email` exists in `user` table:
- If no existing row: proceed with normal flow
- If existing row with same `accountID`: already linked, no action needed
- If existing row with different `accountID`: merge required

### Merge Flow

1. User `alice@gmail.com` (accountID=co_abc) tries to add `alice@work.com`
2. `alice@work.com` already exists with accountID=co_xyz (has its own data)
3. Show warning: "This email has an existing Bubblelist account. Merging will combine both accounts' data."
4. Send verification email with merge flag
5. User clicks link, confirms merge
6. Backend performs merge:

**Step A: Jazz Data Merge**
- Load both Jazz accounts (co_abc and co_xyz)
- Append co_xyz's `root.nodes` to co_abc's `root.nodes`
- Mark all migrated nodes with `migratedFrom: "co_xyz"` for debugging

**Step B: Database Update**
- Update `alice@work.com` user row: set `accountID=co_abc`, copy `encryptedCredentials`
- Update any `share_invites` where `sender_jazz_account_id=co_xyz` to point to `co_abc`

**Step C: Cleanup**
- The orphaned Jazz account (co_xyz) remains in Jazz cloud but is no longer referenced
- No database deletion needed

### Merge Conflicts
- Duplicate folder names: append " (merged)" suffix to incoming folders
- No item-level conflicts possible (items are within folders)

### Merge Limitations
- One-way: cannot un-merge accounts
- User must verify they control the target email (prevents hijacking)
- Both accounts must be accessible (user must be able to log into target email's OAuth)

## Security Considerations

1. **Rate limiting**: Max 3 verification requests per user per hour
2. **Token security**: 32-byte random tokens, single use
3. **Logged-in requirement**: Verification link only works when logged into the requesting account
4. **No email enumeration**: Same response whether email exists or not during verification request
5. **Merge requires verification**: Cannot merge accounts without proving control of target email

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Verify email already linked to same account | No-op, show "already linked" |
| Verify email linked to different account | Trigger merge flow |
| Token expired | Show "link expired", allow re-request |
| Click link while logged into wrong account | Show error, explain must be logged into original account |
| Email registered but never used (no Jazz data) | Normal flow, just update existing row |

## UI Touchpoints

1. **Profile dialog**: "Linked Emails" section with list + "Add Email" button
2. **Share mismatch page**: "Verify email to accept" option
3. **Merge confirmation dialog**: Warning about combining accounts
4. **Verification email**: Simple link with clear instructions

## Implementation Order

1. `email_verification` table migration
2. Verification request/confirm endpoints
3. Profile UI for adding emails
4. Update share matching logic
5. Share mismatch UI flow
6. Merge detection and flow (can defer to v2)

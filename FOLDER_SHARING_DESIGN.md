# Folder Sharing - Design

**Status**: Minimal implementation
**Lines of Code**: ~150 lines total

---

## Architecture

**Backend**: Express + BetterAuth + SQLite + Jazz Agent
**Frontend**: React + Jazz CoValues (with built-in groups)

---

## Data Flow

### Invite Creation
1. Owner clicks "Share" on folder
2. Enters recipient email, permission, expiration
3. Backend generates token, stores invite
4. Returns share URL: `/invite/{token}`
5. Owner sends link manually

### Invite Acceptance
1. Recipient clicks link (may need to login first)
2. Backend validates: recipient email matches session
3. Backend validates: sender still has folder access
4. Backend looks up recipient's Jazz account ID from BetterAuth
5. Jazz agent adds recipient to folder's built-in group
6. Jazz syncs folder to recipient's account

---

## Database

**One table**: `share_invites`
- `token` (primary key)
- `sender_email`, `sender_jazz_account_id`
- `recipient_email` (no Jazz ID yet!)
- `folder_covalue_id`
- `permission` (view/edit/admin)
- `expires_at`, `created_at`, `accepted_at`

---

## API

**POST /api/shares/invite**
- Input: recipientEmail, folderCoValueId, permission, expiresInDays
- Output: { token, shareUrl }

**GET /api/shares/validate/:token**
- Output: { valid, senderEmail, recipientEmail, permission }

**POST /api/shares/accept**
- Input: { token }
- Validates: email match, sender access, not expired
- Looks up: recipient Jazz ID from BetterAuth
- Grants: adds to folder's built-in group via Jazz agent
- Output: { success, folderId }

---

## Security

- Token: 32-byte crypto random (64 hex chars)
- Validation: Email must match OAuth session
- Authorization: Sender must still have folder access
- Expiration: Hard enforced server-side

---

## Jazz Integration

**No schema changes needed!** Jazz CoValues already have built-in groups.

The Jazz agent simply:
1. Loads the folder CoValue
2. Adds recipient to folder's built-in `_group`
3. Sets Jazz role: `reader` (view) or `writer` (edit/admin)

---

## Implementation

**Backend**: 4 files, ~150 lines
- `migrations/shares.sql` - Table
- `db.ts` - Migration runner
- `agent.ts` - Jazz agent (uses built-in groups)
- `shares.ts` - 3 API endpoints

**Frontend**: TODO
- React Router for `/invite/:token`
- InviteAcceptPage component
- ShareDialog component

# Folder Sharing - Minimal Implementation

**Status**: Implemented ✅
**Lines of Code**: ~120 lines (vs ~1500 in complex version)

---

## What Was Built

### 1. Database (10 lines)

**File**: `backend/src/migrations/shares.sql`

One table with 9 fields:
- `token` - URL token (64 hex chars, primary key)
- `from_email` - Inviter's email
- `to_email` - Invitee's email (for validation)
- `folder_covalue_id` - Jazz folder ID
- `recipient_jazz_account_id` - Jazz account to add to group
- `permission` - view/edit/admin
- `expires_at` - Unix timestamp
- `created_at` - Unix timestamp
- `accepted_at` - Unix timestamp (null = pending)

---

### 2. API Endpoints (~80 lines)

**File**: `backend/src/shares.ts`

**Three endpoints:**

#### POST /api/shares/invite
Generate invite link.

**Input**:
```json
{
  "toEmail": "alice@example.com",
  "folderCoValueId": "co_abc123",
  "recipientJazzAccountId": "co_xyz789",
  "permission": "edit",
  "expiresInDays": 7
}
```

**Output**:
```json
{
  "token": "64-char-hex-token",
  "shareUrl": "http://localhost:5173/invite/64-char-hex-token"
}
```

**Logic**:
1. Check session (BetterAuth)
2. Generate 32-byte random token
3. Calculate expiration
4. Insert into database
5. Return share URL

---

#### GET /api/shares/validate/:token
Check if invite is valid (for UI preview).

**Output (valid)**:
```json
{
  "valid": true,
  "fromEmail": "owner@example.com",
  "toEmail": "alice@example.com",
  "permission": "edit"
}
```

**Output (invalid)**:
```json
{
  "valid": false,
  "error": "expired" | "not_found"
}
```

**Logic**:
1. Query database by token
2. Check not accepted
3. Check not expired
4. Return invite details or error

---

#### POST /api/shares/accept
Accept invite and grant access.

**Input**:
```json
{
  "token": "64-char-hex-token"
}
```

**Output**:
```json
{
  "success": true,
  "folderId": "co_abc123"
}
```

**Logic**:
1. Check session (BetterAuth)
2. Load invite from database
3. Validate: `session.user.email === invite.to_email`
4. Jazz agent adds recipient to folder group
5. Mark invite as accepted
6. Return success

---

### 3. Jazz Agent (~30 lines)

**File**: `backend/src/agent.ts`

**Functions**:
- `initAgent()` - Initialize with `JAZZ_AGENT_SECRET`
- `addToFolderGroup(folderCoValueId, recipientJazzAccountId, permission)` - Add user to group

**TODO**: Replace stubs with actual Jazz agent API calls

---

### 4. Database Init (~10 lines)

**File**: `backend/src/db.ts`

Simple function to run migration SQL on startup.

---

## How It Works

### Invite Generation Flow
1. Owner calls `POST /api/shares/invite` with recipient email + folder info
2. Backend generates secure token, stores in database
3. Backend returns share URL: `/invite/{token}`
4. Owner sends link to recipient (manual)

### Invite Acceptance Flow
1. Recipient clicks `/invite/{token}`
2. Frontend checks if logged in, redirects to OAuth if needed
3. Frontend calls `POST /api/shares/accept`
4. Backend validates: logged-in email matches invite
5. Jazz agent adds recipient to folder's access group
6. Backend marks invite as accepted
7. Jazz syncs folder to recipient's account

---

## What's Missing (Can Add Later)

- Rate limiting (simple to add with express-rate-limit)
- Audit logging (add second table if needed)
- Phone number support (already works if OAuth provides phone)
- Batch invites (loop over recipients)
- Permission management endpoints (update/revoke)
- Email auto-detection (just compare against session email/phone)

---

## Next Steps

**Immediate**:
1. Look up Jazz agent API for group management
2. Fill in `addToFolderGroup()` implementation
3. Test with two users

**Frontend** (needed):
1. Add React Router for `/invite/:token` route
2. Create `InviteAcceptPage` component
3. Create `ShareDialog` component
4. Add "Share" button to folder context menu

**Schema Extensions** (needed):
1. Add `accessGroup` field to `FolderNode`
2. Add `permissions` field to `FolderNode`
3. Create `FolderAccessGroup` schema (Jazz group)
4. Create `MemberPermission` schema

---

## Code Summary

**Total Implementation**: 4 files, ~120 lines

```
backend/src/
├── migrations/shares.sql  (10 lines)  - Database table
├── db.ts                  (10 lines)  - Database init
├── agent.ts               (30 lines)  - Jazz agent stub
├── shares.ts              (80 lines)  - API endpoints
├── auth.ts                (modified)  - Export sqliteDb
└── index.ts               (modified)  - Wire up routes
```

**Key Principle**: Keep it simple. One table, one validation rule (email match), one action (add to group).

---

## Environment Variables

Add to `backend/.env`:
```env
JAZZ_AGENT_SECRET=your-secret-here
```

---

**Status**: Backend infrastructure complete, Jazz agent needs API lookup, frontend TODO.

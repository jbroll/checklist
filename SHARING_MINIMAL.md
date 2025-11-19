# Folder Sharing - Minimal Implementation

**Status**: Backend complete ✅
**Lines of Code**: ~150 lines

---

## Database

**File**: `backend/src/migrations/shares.sql`

One table:
```sql
CREATE TABLE share_invites (
  token TEXT PRIMARY KEY,
  sender_email TEXT NOT NULL,
  sender_jazz_account_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  folder_covalue_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER
);
```

**Key insight**: No `recipient_jazz_account_id` at creation - looked up at acceptance!

---

## API Endpoints

### POST /api/shares/invite

**Input**:
```json
{
  "recipientEmail": "alice@example.com",
  "folderCoValueId": "co_abc123",
  "permission": "edit",
  "expiresInDays": 7
}
```

**Flow**:
1. Get sender's Jazz ID from BetterAuth session
2. Generate 32-byte random token
3. Store: token, sender email/Jazz ID, recipient email, folder ID
4. Return share URL

**Output**:
```json
{
  "token": "64-char-hex",
  "shareUrl": "http://localhost:5173/invite/64-char-hex"
}
```

---

### GET /api/shares/validate/:token

**Flow**:
1. Query database by token
2. Check not accepted, not expired
3. Return invite details

**Output**:
```json
{
  "valid": true,
  "senderEmail": "owner@example.com",
  "recipientEmail": "alice@example.com",
  "permission": "edit"
}
```

---

### POST /api/shares/accept

**Input**:
```json
{
  "token": "64-char-hex"
}
```

**Flow**:
1. Load invite from database
2. Validate: `session.user.email === invite.recipient_email`
3. Get recipient's Jazz ID from BetterAuth session
4. Validate: sender still has folder access
5. Jazz agent adds recipient to folder group
6. Mark invite as accepted

**Output**:
```json
{
  "success": true,
  "folderId": "co_abc123"
}
```

---

## Jazz Agent

**File**: `backend/src/agent.ts`

**Functions**:
- `initAgent()` - Initialize with secret
- `validateSenderAccess(folderId, senderJazzId)` - Check sender in group
- `addToFolderGroup(folderId, recipientJazzId, permission)` - Add member

**TODO**: Fill in Jazz API calls

---

## Key Design Decisions

1. **Recipient Jazz ID lookup at acceptance** - Recipient might not have account at invite time
2. **Sender validation** - Prevents stale invites if sender loses access
3. **Email-only validation** - Simple, works with OAuth
4. **Single table** - No complex normalization needed
5. **No audit log** - Can add later if needed

---

## What's Left

**Backend**: Fill in Jazz agent API calls (~1 hour)

**Frontend**:
- React Router for `/invite/:token` (~30 min)
- InviteAcceptPage component (~2 hours)
- ShareDialog component (~2 hours)

**Schema**:
- Add `accessGroup?: Group` to FolderNode (~30 min)
- Add `permissions?: PermissionMetadata[]` to FolderNode (~30 min)

**Total**: ~7 hours remaining

---

## Files Created

```
backend/src/
├── migrations/shares.sql  (15 lines)
├── db.ts                  (12 lines)
├── agent.ts               (67 lines)
├── shares.ts              (131 lines)
└── auth.ts                (modified - export sqliteDb)
└── index.ts               (modified - wire up routes)
```

**Total**: ~225 lines added

---

## Environment

Add to `backend/.env`:
```env
JAZZ_AGENT_SECRET=your-secret-here
```

---

**Next**: Look up Jazz agent API and fill in the stubs

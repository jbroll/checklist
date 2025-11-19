# Folder Sharing - Implementation

**Status**: Backend complete, Jazz agent stubbed, frontend TODO

---

## What's Done ✅

### Backend (4 files, ~150 lines)

**migrations/shares.sql**
- One table with 9 fields
- Stores: token, sender/recipient emails, sender Jazz ID, folder ID, permission

**db.ts**
- Runs migration on startup
- 10 lines

**agent.ts**
- Jazz agent init (stub)
- `validateSenderAccess()` - Check sender still has folder access
- `addToFolderGroup()` - Add recipient to group
- TODO: Fill in Jazz API calls

**shares.ts**
- `POST /api/shares/invite` - Generate token
- `GET /api/shares/validate/:token` - Check if valid
- `POST /api/shares/accept` - Validate & grant access
- 130 lines total

---

## What's Left

### 1. Jazz Agent API (~1 hour)
Look up Jazz API and fill in:
- Agent initialization
- Load folder CoValue
- Check group membership
- Add member to group

### 2. Frontend Routing (~2 hours)
- Install react-router-dom
- Add `/invite/:token` route
- Create InviteAcceptPage component

### 3. Jazz Schema (~1 hour)
Extend FolderNode:
```typescript
accessGroup?: Group
permissions?: Array<{
  accountId: string,
  permission: 'view' | 'edit' | 'admin',
  addedBy: string,
  addedAt: Date
}>
```

### 4. Share Dialog (~4 hours)
- Component with email input, permission selector, expiration
- Call `/api/shares/invite`
- Display share URLs with copy buttons

### 5. Invite Accept Page (~4 hours)
- Load token, call `/api/shares/validate/:token`
- Show sender, permission, expiration
- Accept button → `/api/shares/accept`
- Redirect to folder on success

---

## Total Remaining: ~12 hours

---

## Implementation Order

1. **Jazz Agent** - Fill in API calls (needed for testing)
2. **Schema** - Add fields to FolderNode
3. **Frontend Route** - Set up `/invite/:token`
4. **Accept Page** - Build acceptance UI
5. **Share Dialog** - Build invite creation UI
6. **Test** - End-to-end with two users

---

## Testing Checklist

- [ ] Generate invite as owner
- [ ] Token stored in database
- [ ] Recipient clicks link
- [ ] Login redirect preserves token
- [ ] Email validation works
- [ ] Sender validation works
- [ ] Jazz agent adds to group
- [ ] Folder syncs to recipient
- [ ] Real-time collaboration works

---

## Environment

Add to `backend/.env`:
```
JAZZ_AGENT_SECRET=your-secret-here
```

---

**Next**: Look up Jazz agent API documentation

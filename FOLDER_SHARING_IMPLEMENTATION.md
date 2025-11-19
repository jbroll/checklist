# Folder Sharing - Implementation

**Status**: Backend complete, Jazz agent stubbed, frontend TODO

---

## What's Done ✅

### Backend (4 files, ~150 lines)

**migrations/shares.sql**
- One table with 8 fields
- Stores: token, sender/recipient emails, sender Jazz ID, folder ID, permission

**db.ts**
- Runs migration on startup
- 10 lines

**agent.ts**
- Jazz agent init (stub)
- `validateSenderAccess()` - Check sender in folder's built-in group
- `addToFolderGroup()` - Add recipient to folder's built-in group
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
- Agent initialization with secret
- Load folder CoValue
- Check if user is in folder's `_group`
- Add member to folder's `_group` with role

### 2. Frontend Routing (~2 hours)
- Install react-router-dom
- Add `/invite/:token` route
- Create InviteAcceptPage component

### 3. Share Dialog (~4 hours)
- Component with email input, permission selector, expiration
- Call `/api/shares/invite`
- Display share URLs with copy buttons

### 4. Invite Accept Page (~4 hours)
- Load token, call `/api/shares/validate/:token`
- Show sender, permission, expiration
- Accept button → `/api/shares/accept`
- Redirect to folder on success

---

## Total Remaining: ~11 hours

**Note**: No schema changes needed! Jazz CoValues already have built-in groups.

---

## Implementation Order

1. **Jazz Agent** - Fill in API calls (needed for testing)
2. **Frontend Route** - Set up `/invite/:token`
3. **Accept Page** - Build acceptance UI
4. **Share Dialog** - Build invite creation UI
5. **Test** - End-to-end with two users

---

## Testing Checklist

- [ ] Generate invite as owner
- [ ] Token stored in database
- [ ] Recipient clicks link
- [ ] Login redirect preserves token
- [ ] Email validation works
- [ ] Sender validation works
- [ ] Jazz agent adds to built-in group
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

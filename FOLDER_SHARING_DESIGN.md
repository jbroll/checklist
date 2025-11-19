# Folder Sharing - Design Document

**Version**: 1.0
**Date**: 2025-11-19
**Status**: Approved for Implementation

---

## Overview

Enable secure folder sharing with email-validated invites, configurable permissions, and real-time collaboration via Jazz.tools.

**Core Principle**: Backend validates invites and tracks audit trail; Jazz agent manages access groups; frontend handles real-time sync.

---

## Architecture

### Dual-Backend Authentication

The backend operates with two authentication contexts:

1. **BetterAuth Sessions** - Validate user OAuth sessions (Google/Apple)
2. **Jazz Agent Account** - Service account for managing Jazz groups and permissions

This separation allows secure invite validation (BetterAuth) and Jazz group management (agent).

---

## Data Flow

### Invite Generation

1. Owner selects folder, enters recipient identifiers (email or phone)
2. Frontend calls backend API with folder ID and recipient list
3. Backend verifies owner's session and folder ownership
4. Backend generates cryptographically secure tokens (256-bit)
5. Backend stores invites in SQLite with expiration timestamps
6. Backend returns share URLs to frontend
7. Owner manually distributes links

### Invite Acceptance

1. Recipient clicks share link with token
2. Frontend loads token, checks if user logged in
3. If not logged in, redirect to OAuth (preserve token)
4. Frontend calls backend to accept invite
5. Backend validates token (not expired, not used, not revoked)
6. Backend compares recipient identifier in invite vs. OAuth session
   - Auto-detects email vs. phone by syntax
   - Matches against corresponding session field
7. Backend retrieves recipient's Jazz account ID from BetterAuth database
8. Jazz agent loads folder, adds recipient to access group
9. Jazz agent creates permission metadata record
10. Backend marks invite as accepted, logs to audit
11. Frontend receives success, Jazz syncs folder to recipient's account
12. Real-time collaboration begins

---

## Security Model

### Token Security

- **Generation**: `crypto.randomBytes(32)` → 64 hex characters
- **Storage**: SQLite database, indexed for fast lookup
- **Validation**: Server-side only, never trust client
- **Lifecycle**: One-time use, expires after configured days
- **Transmission**: HTTPS required, tokens in URL path

### Email/Phone Validation

- **Syntax Detection**: Auto-detect email vs. phone by regex
- **Normalization**: Lowercase emails, trim whitespace
- **Verification**: Require OAuth provider verification (email_verified/phone_verified)
- **Matching**: Strict comparison at acceptance time
- **Audit Trail**: Store OAuth `sub` (subject) for stable identifier

### Authorization Checks

All API endpoints verify:
1. User is authenticated (BetterAuth session)
2. User has permission for action (owner/admin check via ownership table)
3. Request is valid (rate limiting, input validation)

### Permission Hierarchy

```
owner > admin > edit > view
```

- **view**: Read-only access to folder and items
- **edit**: Modify items, create sessions
- **admin**: Manage permissions, share folder
- **owner**: Full control, cannot be removed

---

## Data Model

### Backend (SQLite)

**share_invites**
- Stores invite tokens and lifecycle (created, accepted, expired, revoked)
- Links to BetterAuth users (owner and acceptor)
- Records recipient identifier (email or phone)
- Tracks OAuth `sub` for audit trail

**share_audit_log**
- Immutable log of all sharing actions
- Tracks actor, target, folder, action type, timestamp
- Metadata stored as JSON

**folder_ownership**
- Maps Jazz folder CoValue IDs to BetterAuth user IDs
- Enables backend authorization without Jazz queries
- Populated when folders are created

### Jazz (Distributed)

**FolderNode extensions**
- `accessGroup`: Jazz Group managing folder access
- `permissions`: List of permission metadata (accountId, level, added by/at)
- `shareSettings`: Configuration (subfolder inheritance, default expiration)

**FolderAccessGroup**
- Jazz Group controlling who can access folder
- Members have Jazz roles: reader/writer/admin
- Mapped to app permissions: view/edit/admin

**MemberPermission**
- Metadata about each collaborator
- Stores permission level, granter, timestamp
- Complements Jazz group membership

---

## API Endpoints

### POST /api/shares/invite
Generate invite links for recipients.

**Auth**: Required (BetterAuth session)
**Authorization**: User must own or admin folder
**Rate Limit**: 10 requests/minute per user
**Input**: Folder ID, recipient identifiers, permission level, expiration
**Output**: Array of share URLs with tokens

### GET /api/shares/validate/:token
Validate invite token (for UI preview before acceptance).

**Auth**: Not required (public)
**Rate Limit**: 20 requests/minute per IP
**Output**: Valid status, invite details (owner, folder, permission, expiration)

### POST /api/shares/accept
Accept invite and grant folder access.

**Auth**: Required (BetterAuth session)
**Authorization**: Logged-in identifier must match invite recipient
**Input**: Token
**Output**: Success status, folder ID, permission level

### GET /api/shares/folders/:folderId/collaborators
List all collaborators for a folder.

**Auth**: Required
**Authorization**: User must have access to folder
**Output**: Owner info, collaborator list with permissions and metadata

### PUT /api/shares/folders/:folderId/collaborators/:userId
Update collaborator permission level.

**Auth**: Required
**Authorization**: User must be owner or admin
**Input**: New permission level
**Output**: Success status

### DELETE /api/shares/folders/:folderId/collaborators/:userId
Remove collaborator access.

**Auth**: Required
**Authorization**: User must be owner or admin (owner only for admin removal)
**Output**: Success status

### GET /api/shares/folders/:folderId/invites
List pending invites for a folder.

**Auth**: Required
**Authorization**: User must be owner or admin
**Output**: Array of pending invites with metadata

### DELETE /api/shares/invites/:token
Revoke pending invite.

**Auth**: Required
**Authorization**: User must be owner or admin of folder
**Output**: Success status

### POST /api/folders/register
Register folder ownership in backend.

**Auth**: Required
**Input**: Folder ID (Jazz CoValue ID), owner user ID
**Output**: Success status
**Note**: Called by frontend when creating folders

---

## User Experience

### Invite Generation Flow

1. Owner right-clicks folder → "Share"
2. Dialog opens with email/phone input field
3. Owner enters identifiers, selects permission level and expiration
4. Click "Generate Links"
5. Dialog shows share URLs with copy buttons
6. Owner manually sends links (email, Slack, etc.)

### Invite Acceptance Flow

1. Recipient clicks share link → `/invite/:token`
2. If not logged in: Redirect to OAuth, preserve token
3. Show invite preview: who invited, folder name, permission level
4. Recipient clicks "Accept Invite"
5. Backend validates, Jazz grants access
6. Success message: "Access granted!"
7. Redirect to folder or dashboard
8. Folder appears in tree, real-time sync active

### Permission Management Flow

1. Owner/admin right-clicks folder → "Manage Access"
2. Dialog shows owner, collaborators, pending invites
3. Change permission via dropdown (immediate update)
4. Remove collaborator via trash icon (confirmation required)
5. Revoke pending invite via revoke button
6. Real-time updates if other admins make changes

---

## Frontend Components

### ShareDialog
- Multi-input field for email/phone identifiers
- Permission level selector (radio group)
- Expiration selector (dropdown)
- Generate button → Shows share URLs
- Copy buttons for each URL

### InviteAcceptPage
- Full-page route `/invite/:token`
- States: Loading, auth check, preview, accepting, success, error
- Handles login redirect with token preservation
- Shows clear error messages for expired/invalid tokens

### ManageAccessDialog
- Lists owner, collaborators, pending invites
- Inline permission dropdowns
- Remove/revoke actions with confirmations
- Real-time updates via Jazz sync

### FolderTree Enhancements
- Visual indicators: shared badge, collaborator count
- Context menu: "Share", "Manage Access", "Leave Folder"
- Permission badges for non-owned folders

---

## Scalability Considerations

### Database Performance
- Indexes on token, folder_id, recipient_identifier, expires_at
- Cleanup job for expired invites (hourly)
- Pagination for folders with 100+ collaborators

### Rate Limiting
- Per-user limits for invite generation (prevent spam)
- Per-IP limits for token validation (prevent brute force)
- In-memory store with sliding window algorithm

### Jazz Sync
- Optimistic updates in UI with rollback on failure
- Loading states during group membership changes
- Automatic retry on network failures

---

## Testing Strategy

### Unit Tests
- Token generation (uniqueness, format, cryptographic strength)
- Identifier validation (email/phone detection and normalization)
- Permission hierarchy checks
- Database operations (CRUD for invites and audit logs)

### Integration Tests
- Full invite generation flow (API → database)
- Full acceptance flow (API → Jazz agent → database)
- Permission update flow (API → Jazz agent)
- Error handling (expired, invalid, revoked tokens)

### End-to-End Tests (Playwright)
- Multi-user scenario: User A invites User B, B accepts, both collaborate
- Permission changes: A changes B's permission, B sees update
- Revocation: A removes B, B loses access
- Email mismatch: C tries to accept B's invite, rejected

---

## Failure Modes & Recovery

### Token Validation Failures
- Expired: Clear error message, suggest requesting new invite
- Already accepted: Redirect to folder
- Revoked: Show "Invite revoked by owner"
- Invalid: Show "Invalid invite link"

### Jazz Agent Failures
- Timeout: Retry with exponential backoff
- Group creation fails: Rollback database transaction
- Permission update fails: Show error, allow retry

### Session Expiration
- During acceptance: Redirect to login, preserve token
- During collaboration: Prompt re-authentication
- OAuth token refresh handled by BetterAuth

---

## Future Enhancements

### Phase 2 (Post-MVP)
- Public links (anyone with link, optional password)
- Bulk invites (CSV upload)
- Email notifications (optional, sent by backend)
- Activity feed (who added/edited what)
- Permission templates (preset configurations)

### Phase 3 (Advanced)
- Organization accounts (team workspaces)
- Role-based access control (custom roles)
- Time-limited permissions (auto-expire after duration)
- Real-time presence indicators (who's viewing)
- Comments and discussions on items

---

## Security Audit Checklist

- [ ] Token generation uses secure randomness
- [ ] All endpoints verify authentication
- [ ] Authorization checks prevent privilege escalation
- [ ] Rate limiting prevents abuse
- [ ] Input validation prevents injection attacks
- [ ] HTTPS required for all requests
- [ ] OAuth identifiers verified by provider
- [ ] Audit log captures all actions
- [ ] Sensitive data encrypted at rest (Jazz handles)
- [ ] Error messages don't leak sensitive info

---

## Success Criteria

- Users can share folders with email/phone recipients
- Recipients can accept invites and collaborate in real-time
- Permission levels are enforced (view/edit/admin)
- Owners can manage collaborators and pending invites
- All sharing actions are logged for audit
- Security requirements met (token strength, validation, authorization)
- Performance acceptable (< 2s invite generation, < 3s acceptance)
- No breaking changes to existing folder functionality

---

**Approved By**: Development Team
**Implementation Start**: 2025-11-19
**Target Completion**: 18-20 days

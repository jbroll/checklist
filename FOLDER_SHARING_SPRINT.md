# Folder Sharing Sprint

**Sprint Goal**: Implement secure, email-validated folder sharing with configurable permissions and expiration.

**Target**: Add collaborative list management to enable users to share templates and organizational folders with specific individuals via time-limited, email-restricted invite links.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Architecture Overview](#architecture-overview)
3. [Data Models](#data-models)
4. [API Design](#api-design)
5. [Frontend Flows](#frontend-flows)
6. [Sprint Breakdown](#sprint-breakdown)
7. [Success Criteria](#success-criteria)
8. [Testing Strategy](#testing-strategy)
9. [Security Considerations](#security-considerations)
10. [Future Enhancements](#future-enhancements)

---

## Requirements

### Functional Requirements

**FR-1: Invite Generation**
- Owner can generate share links for any folder they own
- Each invite is tied to a specific recipient email address
- Owner specifies permission level: `view`, `edit`, or `admin`
- Owner can set expiration (7/30 days, custom, or never)
- System generates unique, secure token for each invite
- Owner manually distributes link (no automated email sending)

**FR-2: Invite Acceptance**
- Recipient clicks share link containing token
- System validates recipient's logged-in email matches invite email
- On validation success, grant folder access via Jazz groups
- Recipient immediately sees folder in their folder tree
- Real-time collaboration begins automatically via Jazz sync

**FR-3: Permission Management**
- Three permission levels with clear hierarchy:
  - **View**: Read-only access to folder and items
  - **Edit**: Can modify items, add/remove items, create sessions
  - **Admin**: Full control including sharing, deleting, managing permissions
- Permission inheritance for subfolders (configurable)
- Owner can change collaborator permissions post-acceptance
- Owner can revoke collaborator access at any time

**FR-4: Folder Tree Integration**
- Visual indicators show which folders are shared
- Show collaborator count on shared folders
- Context menu includes "Manage Access" option
- Drag-and-drop warns about permission changes
- Display inherited permissions on subfolders

**FR-5: Audit & Transparency**
- Log all sharing actions (invite created, accepted, revoked, permission changed)
- Display who added each collaborator and when
- Show pending invites separately from active collaborators
- Track token usage (when accepted, by whom)

### Non-Functional Requirements

**NFR-1: Security**
- Tokens use cryptographically secure random generation (32 bytes minimum)
- Email validation strictly enforced server-side
- All sharing operations require authentication
- Rate limiting on invite generation to prevent spam
- HTTPS required for all share links

**NFR-2: User Experience**
- Invite generation completes in < 2 seconds
- Invite acceptance redirects smoothly with clear feedback
- Permission changes reflect immediately via Jazz sync
- Error messages are clear and actionable
- Mobile-responsive design for all sharing UI

**NFR-3: Data Integrity**
- Expired invites cannot be accepted (hard validation)
- Revoked invites cannot be reused
- Permission changes propagate to Jazz within 1 second
- No orphaned access records (cleanup on folder deletion)

**NFR-4: Scalability**
- Support up to 10 recipients per invite batch
- Handle folders with 100+ collaborators
- Efficient permission checking (O(1) for direct, O(n) for inherited)
- Database indexes on token, folder_id, recipient_email

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ShareDialog  │  │ AcceptInvite │  │ ManageAccess │      │
│  │  Component   │  │     Route    │  │    Dialog    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │ REST API
┌────────────────────────────┼─────────────────────────────────┐
│                  Backend (Express + BetterAuth)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Sharing API Endpoints                    │   │
│  │  /api/shares/invite                                   │   │
│  │  /api/shares/validate/:token                         │   │
│  │  /api/shares/accept                                   │   │
│  │  /api/shares/folders/:id/collaborators               │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                              │                               │
│  ┌──────────────────────────┴───────────────────────────┐   │
│  │          SQLite Database (auth.db)                    │   │
│  │  ┌──────────────┐  ┌──────────────────────────┐     │   │
│  │  │share_invites │  │   share_audit_log        │     │   │
│  │  │     table    │  │       table              │     │   │
│  │  └──────────────┘  └──────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                             │
                             │ Jazz Protocol
┌────────────────────────────┼─────────────────────────────────┐
│                     Jazz.tools (Distributed DB)              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   FolderNode CoValues                 │   │
│  │  - accessGroup: FolderAccessGroup (Jazz Group)       │   │
│  │  - permissions: CoList<MemberPermission>             │   │
│  │  - shareSettings: Configuration                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Real-time sync, offline-first, encrypted storage           │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow: Invite Generation

```
1. Owner clicks "Share" on folder
   ↓
2. Frontend: ShareDialog opens
   ↓
3. Owner enters: recipientEmails[], permissionLevel, expiresInDays
   ↓
4. Frontend: POST /api/shares/invite
   ↓
5. Backend validates:
   - User is authenticated
   - User owns the folder (via Jazz ownership check)
   - Email format is valid
   - Permission level is valid
   ↓
6. Backend generates:
   - Secure random token (crypto.randomBytes(32))
   - Expiration timestamp (if specified)
   ↓
7. Backend stores in share_invites table:
   - token, owner_id, recipient_email, folder_id, permission_level, expires_at
   ↓
8. Backend logs to share_audit_log:
   - action: 'invite_created'
   ↓
9. Backend returns: shareUrl = `${FRONTEND_URL}/invite/${token}`
   ↓
10. Frontend displays share links with copy buttons
    ↓
11. Owner manually sends link to recipients (email, Slack, etc.)
```

### Data Flow: Invite Acceptance

```
1. Recipient clicks share link: /invite/:token
   ↓
2. Frontend: InviteAccept route renders
   ↓
3. Frontend checks authentication:
   - If not logged in → redirect to login, preserve token in state
   - If logged in → proceed
   ↓
4. Frontend: GET /api/shares/validate/:token
   ↓
5. Backend validates:
   - Token exists in database
   - Not expired (expires_at > now)
   - Not already accepted (accepted_at is null)
   - Not revoked (revoked_at is null)
   ↓
6. Backend returns: invite details (owner, folder, permission)
   ↓
7. Frontend displays confirmation UI with folder details
   ↓
8. User confirms → Frontend: POST /api/shares/accept { token }
   ↓
9. Backend validates:
   - User is authenticated
   - Logged-in user email === invite recipient_email (strict match)
   - Token still valid (re-check)
   ↓
10. Backend updates Jazz:
    - Add user to folder.accessGroup (Jazz Group)
    - Create MemberPermission record
    - Set permission level
    ↓
11. Backend updates database:
    - Set accepted_at = now, accepted_by_user_id = user.id
    ↓
12. Backend logs to share_audit_log:
    - action: 'invite_accepted'
    ↓
13. Backend returns: { success: true, folderId }
    ↓
14. Frontend:
    - Show success message
    - Redirect to folder
    - Jazz syncs access → folder appears in recipient's tree
    ↓
15. Real-time collaboration active
```

### Permission Hierarchy

```
Levels (lowest to highest):
┌──────────┐
│   view   │  Can read folder and items
└──────────┘
     ↓
┌──────────┐
│   edit   │  Can modify items, create sessions
└──────────┘
     ↓
┌──────────┐
│  admin   │  Can share, manage permissions, delete
└──────────┘
     ↓
┌──────────┐
│  owner   │  Full control (cannot be removed)
└──────────┘

Permission Checks:
- view actions: Require 'view' or higher
- edit actions: Require 'edit' or higher
- admin actions: Require 'admin' or owner
- owner actions: Require owner only

Inheritance Rules:
- If folder.shareSettings.allowSubfolderInheritance = true:
  → Child folders inherit parent permissions
- Explicit permissions override inherited permissions
- Most restrictive permission applies (if conflict)

Example:
ParentFolder
  └── permissions: { UserA: 'edit' }
      └── shareSettings.allowSubfolderInheritance: true
          └── ChildFolder
              → UserA effective permission: 'edit' (inherited)

ChildFolder (explicit)
  └── permissions: { UserA: 'view' }
      → UserA effective permission: 'view' (explicit overrides)
```

---

## Data Models

### Backend Database Schema

#### Table: `share_invites`

**Purpose**: Store invite tokens and track lifecycle

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique identifier |
| `token` | TEXT | UNIQUE NOT NULL | Secure random token (64 hex chars) |
| `owner_id` | TEXT | NOT NULL, FK(user.id) | Account ID of folder owner |
| `owner_email` | TEXT | NOT NULL | Email of inviter (denormalized for audit) |
| `recipient_email` | TEXT | NOT NULL | Email of intended recipient |
| `folder_id` | TEXT | NOT NULL | Jazz CoValue ID of folder |
| `permission_level` | TEXT | NOT NULL | 'view', 'edit', or 'admin' |
| `expires_at` | INTEGER | NULL | Unix timestamp, NULL = never expires |
| `created_at` | INTEGER | NOT NULL | Unix timestamp of creation |
| `accepted_at` | INTEGER | NULL | Unix timestamp of acceptance, NULL = pending |
| `accepted_by_user_id` | TEXT | NULL, FK(user.id) | Account ID of user who accepted |
| `revoked_at` | INTEGER | NULL | Unix timestamp of revocation, NULL = active |

**Indexes**:
```sql
CREATE INDEX idx_share_invites_token ON share_invites(token);
CREATE INDEX idx_share_invites_folder_id ON share_invites(folder_id);
CREATE INDEX idx_share_invites_recipient_email ON share_invites(recipient_email);
CREATE INDEX idx_share_invites_expires_at ON share_invites(expires_at);
```

**Validation Rules**:
- `token`: 64 hexadecimal characters
- `permission_level`: One of 'view', 'edit', 'admin'
- `expires_at`: Must be future timestamp if not NULL
- `recipient_email`: Valid email format (RFC 5322)

---

#### Table: `share_audit_log`

**Purpose**: Complete audit trail of all sharing actions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique identifier |
| `action` | TEXT | NOT NULL | Action type (see below) |
| `actor_id` | TEXT | NOT NULL, FK(user.id) | Account ID of user performing action |
| `target_user_id` | TEXT | NULL | Account ID of affected user |
| `folder_id` | TEXT | NOT NULL | Jazz CoValue ID of folder |
| `metadata` | TEXT | NULL | JSON with action-specific data |
| `created_at` | INTEGER | NOT NULL | Unix timestamp |

**Action Types**:
- `invite_created`: Owner generated invite
  - metadata: `{ recipientEmail, permissionLevel, expiresAt }`
- `invite_accepted`: Recipient accepted invite
  - metadata: `{ token, permissionLevel }`
- `invite_revoked`: Owner revoked pending invite
  - metadata: `{ token, recipientEmail }`
- `permission_changed`: Owner changed collaborator permission
  - metadata: `{ oldPermission, newPermission, targetUserId }`
- `access_revoked`: Owner removed collaborator
  - metadata: `{ targetUserId, hadPermission }`
- `folder_shared`: Folder moved into shared folder (auto-shared)
  - metadata: `{ parentFolderId, inheritedPermissions }`

**Indexes**:
```sql
CREATE INDEX idx_share_audit_log_folder_id ON share_audit_log(folder_id);
CREATE INDEX idx_share_audit_log_actor_id ON share_audit_log(actor_id);
CREATE INDEX idx_share_audit_log_created_at ON share_audit_log(created_at);
```

---

### Jazz Schema Extensions

#### New File: `src/schemas/groups.ts`

**Purpose**: Define Jazz group and permission structures

**Schema: `FolderAccessGroup`**
- Type: Jazz Group (co.group)
- Purpose: Manage member access to folder
- Members: Jazz automatically tracks group members
- Lifecycle: Created when first invite accepted, deleted when last member removed

**Schema: `MemberPermission`**
- Type: CoMap (co.map)
- Purpose: Store metadata about each collaborator's permission

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | string (Account ID) | Reference to collaborator account |
| `permission` | `'view' \| 'edit' \| 'admin'` | Permission level |
| `addedBy` | string (Account ID) | Account who granted access |
| `addedAt` | Date | Timestamp of access grant |

**Design Notes**:
- Jazz groups provide cryptographic access control
- MemberPermission stores application-level metadata
- Separation allows Jazz to handle sync while we manage permissions
- accountId is string (not Account reference) to avoid circular dependencies

---

#### Extension: `src/schemas/tree.ts`

**Extend `FolderNode` schema with new fields**:

| Field | Type | Optional | Description |
|-------|------|----------|-------------|
| `accessGroup` | FolderAccessGroup | Yes | Jazz group managing folder access |
| `permissions` | CoList<MemberPermission> | Yes | Permission metadata for each collaborator |
| `shareSettings` | ShareSettings object | Yes | Configuration for sharing behavior |

**ShareSettings object**:
```
{
  allowSubfolderInheritance: boolean
    - If true, subfolders inherit parent permissions
    - Default: true

  defaultExpirationDays: number | null
    - Default expiration for new invites
    - null = owner must choose
    - Default: 7
}
```

**Migration Strategy**:
- Existing folders: Fields start as undefined/null
- On first share: Initialize accessGroup and permissions
- Backwards compatible: Unshared folders work as before

---

## API Design

### Endpoint: POST /api/shares/invite

**Purpose**: Generate invite link(s) for folder sharing

**Authentication**: Required (session cookie)

**Request Body**:
```json
{
  "folderId": "co_abc123...",
  "recipientEmails": ["alice@example.com", "bob@example.com"],
  "permissionLevel": "edit",
  "expiresInDays": 7,
  "message": "Let's collaborate on this list!"
}
```

**Validations**:
- `folderId`: Must be valid Jazz CoValue ID
- `recipientEmails`: Array of 1-10 valid email addresses
- `permissionLevel`: One of 'view', 'edit', 'admin'
- `expiresInDays`: Integer 1-365, or null for no expiration
- `message`: Optional string, max 500 characters

**Authorization**:
- Verify user owns folder or has 'admin' permission

**Response** (200 OK):
```json
{
  "invites": [
    {
      "email": "alice@example.com",
      "shareUrl": "https://app.bubblelist.com/invite/abc123xyz...",
      "token": "abc123xyz...",
      "expiresAt": "2025-12-25T00:00:00Z"
    },
    {
      "email": "bob@example.com",
      "shareUrl": "https://app.bubblelist.com/invite/def456uvw...",
      "token": "def456uvw...",
      "expiresAt": null
    }
  ]
}
```

**Error Responses**:
- 401: Not authenticated
- 403: Not authorized to share folder
- 400: Invalid request body
- 429: Rate limit exceeded (max 10 invites/minute)

**Implementation Notes**:
- Generate unique token per recipient (crypto.randomBytes(32).toString('hex'))
- Store each invite in database atomically
- Log to audit table
- Return all results even if partial success (include errors array)

---

### Endpoint: GET /api/shares/validate/:token

**Purpose**: Validate invite token before acceptance (for UI display)

**Authentication**: Not required (public endpoint)

**URL Parameters**:
- `token`: The invite token from share URL

**Response** (200 OK - Valid):
```json
{
  "valid": true,
  "invite": {
    "ownerEmail": "owner@example.com",
    "ownerName": "Jane Doe",
    "folderName": "Grocery Shopping",
    "permissionLevel": "edit",
    "expiresAt": "2025-12-25T00:00:00Z"
  }
}
```

**Response** (200 OK - Invalid):
```json
{
  "valid": false,
  "error": "expired",
  "errorMessage": "This invite link expired on December 18, 2025"
}
```

**Error Types**:
- `not_found`: Token doesn't exist
- `expired`: Token expired
- `already_accepted`: Token already used
- `revoked`: Token was revoked by owner

**Implementation Notes**:
- Fetch folder metadata from Jazz to display folder name
- Don't expose sensitive information in error messages
- Cache folder names (1 minute TTL) to reduce Jazz queries
- Rate limit: 20 requests/minute per IP

---

### Endpoint: POST /api/shares/accept

**Purpose**: Accept invite and grant folder access

**Authentication**: Required (session cookie)

**Request Body**:
```json
{
  "token": "abc123xyz..."
}
```

**Validations**:
- `token`: Must be valid invite token
- User email must match invite recipient_email (case-insensitive)

**Authorization**:
- Verify token is valid (not expired, not accepted, not revoked)
- Verify authenticated user's email matches recipient_email

**Response** (200 OK):
```json
{
  "success": true,
  "folderId": "co_abc123...",
  "folderName": "Grocery Shopping",
  "permissionLevel": "edit"
}
```

**Error Responses**:
- 401: Not authenticated
- 403: Email mismatch (logged in as wrong user)
- 400: Invalid or expired token
- 409: Already accepted by this user

**Implementation Notes**:
- Update Jazz schema:
  - Create accessGroup if first collaborator
  - Add user to accessGroup
  - Create MemberPermission record
- Update database:
  - Set accepted_at, accepted_by_user_id
- Log to audit table
- Transaction: Roll back database if Jazz update fails

---

### Endpoint: GET /api/shares/folders/:folderId/collaborators

**Purpose**: List all collaborators for a folder

**Authentication**: Required

**URL Parameters**:
- `folderId`: Jazz CoValue ID of folder

**Authorization**:
- User must have access to folder (owner or collaborator)

**Response** (200 OK):
```json
{
  "owner": {
    "userId": "user_123",
    "email": "owner@example.com",
    "name": "Jane Doe"
  },
  "collaborators": [
    {
      "userId": "user_456",
      "email": "alice@example.com",
      "name": "Alice Smith",
      "permission": "edit",
      "addedBy": "user_123",
      "addedByEmail": "owner@example.com",
      "addedAt": "2025-11-15T10:30:00Z"
    },
    {
      "userId": "user_789",
      "email": "bob@example.com",
      "name": "Bob Jones",
      "permission": "view",
      "addedBy": "user_123",
      "addedByEmail": "owner@example.com",
      "addedAt": "2025-11-18T14:20:00Z"
    }
  ]
}
```

**Implementation Notes**:
- Fetch from Jazz: folder.permissions list
- Join with BetterAuth user table for names
- Sort by permission level (admin > edit > view), then by addedAt

---

### Endpoint: PUT /api/shares/folders/:folderId/collaborators/:userId

**Purpose**: Update collaborator permission level

**Authentication**: Required

**URL Parameters**:
- `folderId`: Jazz CoValue ID of folder
- `userId`: Account ID of collaborator

**Authorization**:
- User must be owner or have 'admin' permission
- Cannot modify owner permission

**Request Body**:
```json
{
  "permission": "view"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "userId": "user_456",
  "newPermission": "view"
}
```

**Error Responses**:
- 403: Not authorized (not admin)
- 400: Invalid permission level
- 404: Collaborator not found
- 409: Cannot modify owner

**Implementation Notes**:
- Update Jazz: Find MemberPermission, update permission field
- Log to audit table with old and new permission
- Jazz sync propagates change to all clients

---

### Endpoint: DELETE /api/shares/folders/:folderId/collaborators/:userId

**Purpose**: Remove collaborator access

**Authentication**: Required

**URL Parameters**:
- `folderId`: Jazz CoValue ID of folder
- `userId`: Account ID of collaborator to remove

**Authorization**:
- User must be owner or have 'admin' permission
- Cannot remove owner
- Admins cannot remove other admins (only owner can)

**Response** (200 OK):
```json
{
  "success": true,
  "removedUserId": "user_456"
}
```

**Error Responses**:
- 403: Not authorized
- 404: Collaborator not found
- 409: Cannot remove owner or admin

**Implementation Notes**:
- Update Jazz:
  - Remove user from accessGroup
  - Remove MemberPermission record
  - If last collaborator, delete accessGroup
- Log to audit table
- Removed user loses access immediately (Jazz sync)

---

### Endpoint: GET /api/shares/folders/:folderId/invites

**Purpose**: List pending invites for a folder

**Authentication**: Required

**URL Parameters**:
- `folderId`: Jazz CoValue ID of folder

**Authorization**:
- User must be owner or have 'admin' permission

**Response** (200 OK):
```json
{
  "pending": [
    {
      "token": "abc123xyz...",
      "recipientEmail": "charlie@example.com",
      "permission": "edit",
      "createdAt": "2025-11-18T10:00:00Z",
      "expiresAt": "2025-11-25T10:00:00Z",
      "createdBy": "owner@example.com"
    }
  ]
}
```

**Implementation Notes**:
- Query database: accepted_at IS NULL AND revoked_at IS NULL
- Filter expired invites (optional: include in separate array)
- Sort by created_at DESC

---

### Endpoint: DELETE /api/shares/invites/:token

**Purpose**: Revoke pending invite

**Authentication**: Required

**URL Parameters**:
- `token`: Invite token to revoke

**Authorization**:
- User must be folder owner or admin

**Response** (200 OK):
```json
{
  "success": true,
  "revokedToken": "abc123xyz..."
}
```

**Error Responses**:
- 403: Not authorized
- 404: Invite not found
- 409: Already accepted (cannot revoke)

**Implementation Notes**:
- Update database: Set revoked_at = NOW()
- Log to audit table
- Revoked invites cannot be accepted (validate in accept endpoint)

---

## Frontend Flows

### Flow 1: Share Dialog (Invite Generation)

**Entry Points**:
- Folder context menu → "Share..."
- Folder toolbar → Share icon button
- Keyboard shortcut: `Cmd+Shift+S` (when folder selected)

**Component**: `ShareDialog.tsx`

**UI States**:

1. **Initial State** (Form)
   - Title: "Share '[Folder Name]'"
   - Email input field (multi-chip input)
     - Validation: Real-time email format check
     - Support paste multiple emails (comma/newline separated)
     - Max 10 recipients
   - Permission level selector (radio group)
     - View only (description: "Can see items")
     - Can edit (description: "Can modify items and sessions") [default]
     - Admin (description: "Full control + sharing")
   - Expiration selector (dropdown)
     - 7 days [default]
     - 30 days
     - Never expires
     - Custom (shows number input)
   - Subfolder inheritance toggle
     - "Apply permissions to subfolders" (checked by default)
   - Message field (optional, multiline, max 500 chars)
   - Actions:
     - Cancel (secondary)
     - Generate Links (primary, disabled until valid email)

2. **Loading State**
   - Show spinner overlay
   - Disable form inputs
   - Message: "Generating share links..."

3. **Success State** (Results)
   - Title: "Share Links Generated ✓"
   - For each recipient, show:
     - Email address
     - Full share URL (read-only input with copy button)
     - Expiration info ("Expires Dec 25" or "Never expires")
     - "Copy Link" button
     - "Send via Email" button (opens mailto:)
   - Success message: "Links created. Send them to recipients to grant access."
   - Action: "Done" (closes dialog)

4. **Error State**
   - Show error message inline
   - Highlight problematic fields
   - Keep form editable for corrections
   - Example errors:
     - "You don't have permission to share this folder"
     - "alice@example.com already has access"
     - "Rate limit exceeded. Try again in 1 minute."

**Validation Rules**:
- At least 1 valid email required
- No duplicate emails in single request
- Email format: RFC 5322 compliant
- Permission level: Must select one
- Expiration: If custom, must be 1-365 days

**Accessibility**:
- Focus management: Focus email input on open
- Keyboard navigation: Tab through all controls
- ARIA labels: Clear labels for screen readers
- Error announcements: aria-live regions for errors

**Design Notes**:
- Use existing dialog pattern from import/export dialogs
- Email chips should have remove buttons (X icon)
- Permission descriptions help clarify access levels
- "Send via Email" opens mailto: with pre-filled subject/body
- Copy button shows success toast on click

---

### Flow 2: Invite Acceptance

**Entry Point**: User clicks share link: `https://app.com/invite/:token`

**Route**: `/invite/:token`

**Component**: `InviteAcceptPage.tsx`

**Flow States**:

1. **Loading** (Initial)
   - Show spinner
   - Message: "Loading invite..."
   - Backend call: GET /api/shares/validate/:token

2. **Not Authenticated**
   - If validate succeeds but user not logged in:
   - Show invite preview:
     - "john@example.com invited you to collaborate"
     - Folder name: "Grocery Stores"
     - Permission level: "Edit access"
   - Message: "Sign in to accept this invite"
   - Actions:
     - "Sign in with Google"
     - "Sign in with Apple"
   - After login: Return to this page (preserve token in URL)

3. **Email Mismatch**
   - User logged in, but email doesn't match invite
   - Show:
     - "This invite was sent to: invited@example.com"
     - "You are logged in as: other@example.com"
     - "Please sign in with the invited email address."
   - Actions:
     - "Sign Out & Switch Account"
     - "Contact invite sender"

4. **Valid Invite** (Confirmation)
   - Show invite details:
     - Sender: "john@example.com invited you"
     - Folder: "Grocery Stores" (with folder icon)
     - Permission: "You'll have edit access"
     - Expiration: "This invite expires in 2 days" (if applicable)
   - Message: "You'll be able to view and edit items in this folder."
   - Actions:
     - "Decline" (secondary, just closes page)
     - "Accept Invite" (primary, large button)

5. **Accepting** (Loading)
   - Show spinner
   - Message: "Granting access..."
   - Disable actions

6. **Success**
   - Show success icon (checkmark)
   - Message: "Access granted! You now have edit access to 'Grocery Stores'"
   - Folder now syncing via Jazz
   - Actions:
     - "Go to Folder" (primary, navigates to folder)
     - "View Dashboard" (secondary, goes to home)
   - Auto-redirect to folder in 3 seconds

7. **Error States**
   - **Expired**: "This invite link expired on December 18, 2025"
   - **Already Accepted**: "You already have access to this folder"
   - **Not Found**: "This invite link is invalid or has been revoked"
   - **Revoked**: "This invite was revoked by the folder owner"
   - Each shows:
     - Error icon
     - Clear error message
     - Action: "Go to Dashboard"

**Navigation**:
- Preserve token in URL during login redirect
- After success, clear token from history (replace state)
- Browser back button after success goes to dashboard (not invite page)

**Design Notes**:
- Full-page component (not dialog)
- Center-aligned card layout
- Visual hierarchy: Sender → Folder → Permission → Action
- Use folder tree icon matching folder type (template/organizational)
- Permission badge with icon (eye for view, pencil for edit, shield for admin)

---

### Flow 3: Manage Access Dialog

**Entry Points**:
- Folder context menu → "Manage Access"
- Folder toolbar → People icon button (shows count if > 0)

**Component**: `ManageAccessDialog.tsx`

**Authorization**: Only visible if user is owner or admin

**UI Sections**:

1. **Header**
   - Title: "Manage Access: [Folder Name]"
   - Close button (X)

2. **Owner Section**
   - Label: "Owner"
   - Card with:
     - Avatar (initials or photo)
     - Email
     - Badge: "Owner"
   - No actions (owner cannot be removed/changed)

3. **Collaborators Section**
   - Label: "Collaborators (X)" (count of active collaborators)
   - If empty: "No collaborators yet"
   - For each collaborator, show card:
     - Avatar
     - Email
     - Name (if available)
     - Permission dropdown:
       - View only
       - Can edit
       - Admin
       - OnChange: Immediately update via API
     - "Remove" button (trash icon)
       - Confirmation dialog: "Remove alice@example.com? They will lose access immediately."
     - Metadata: "Added by you on Dec 10"

4. **Pending Invites Section**
   - Label: "Pending Invites (X)" (count)
   - Collapsible (collapsed by default if > 3)
   - For each invite, show card:
     - Email (with pending badge)
     - Permission level
     - Expiration info: "Expires in 2 days" or "Never expires"
     - Actions:
       - "Copy Link" (copies share URL again)
       - "Resend" (opens email client)
       - "Revoke" (removes from list)
   - If no pending invites: Hide section

5. **Footer**
   - "Invite More" button (opens ShareDialog)
   - "Done" button (closes dialog)

**Interactive Behaviors**:

- **Permission Change**:
  - Dropdown change triggers immediate API call
  - Show inline spinner during update
  - On success: Update UI, show success toast
  - On error: Revert dropdown, show error message
  - Cannot change own permission (disabled)
  - Only owner can promote to admin

- **Remove Collaborator**:
  - Click trash icon → Confirmation modal
  - Modal:
    - "Remove alice@example.com from 'Grocery Stores'?"
    - "They will immediately lose access to this folder."
    - Cancel / Remove (danger button)
  - On confirm: API call, remove from list, show toast
  - Cannot remove self (different UX: "Leave Folder")

- **Revoke Invite**:
  - Click revoke → Confirmation modal
  - Modal: "Revoke invite to charlie@example.com?"
  - On confirm: API call, remove from pending list

**Real-time Updates**:
- If another admin adds/removes collaborators:
  - Jazz sync updates permissions CoList
  - React component re-renders with new data
- Show toast: "alice@example.com was added by john@example.com"

**Design Notes**:
- Use card layout for each person (consistent with other dialogs)
- Permission dropdown should be inline (not separate dialog)
- Visual distinction: Owner (blue), Admin (purple), Edit (green), View (gray)
- Pending invites use dashed border to indicate temporary state
- Confirmation modals prevent accidental removal

---

### Flow 4: Folder Tree Integration

**Component**: `FolderTree.tsx` (extend existing)

**Visual Indicators**:

1. **Shared Folder Icon**
   - If folder has collaborators:
     - Add badge with people icon (👥)
     - Badge shows count: "3" if 3 collaborators
     - Badge color: Blue for shared folders
   - Hover: Tooltip shows "Shared with 3 people"

2. **Permission Level Indicator**
   - For folders user doesn't own:
     - Show permission badge next to name
     - "View" (eye icon), "Edit" (pencil icon), "Admin" (shield icon)
   - Hover: Tooltip shows "Edit access granted by john@example.com"

3. **Inherited Permissions**
   - Subfolders of shared folders:
     - Show dimmed people icon
     - Hover: "Inherits permissions from parent folder"

**Context Menu Additions**:

- Add menu item: "Share..." (if owner/admin)
  - Icon: Share icon
  - Shortcut: Cmd+Shift+S
  - Opens ShareDialog

- Add menu item: "Manage Access" (if owner/admin)
  - Icon: People icon
  - Shows collaborator count in label: "Manage Access (3)"
  - Opens ManageAccessDialog

- Add menu item: "Leave Folder" (if collaborator, not owner)
  - Icon: Exit icon
  - Confirmation: "Leave 'Grocery Stores'? You'll lose access unless re-invited."

**Drag-and-Drop Behaviors**:

1. **Dragging Personal Folder → Shared Folder**
   - On drop hover: Show warning icon
   - On drop: Confirmation modal:
     - "Share 'My Recipes' with 3 people?"
     - "This folder will be moved into 'Shared Lists' and inherit its permissions."
     - "alice@example.com, bob@example.com will gain edit access."
     - Cancel / Move & Share (primary)

2. **Dragging Shared Folder → Personal Folder**
   - On drop: Confirmation modal:
     - "Move 'Team Recipes' to personal folders?"
     - "This folder will stop being shared. 2 people will lose access."
     - Cancel / Move & Unshare (danger)

3. **Dragging Between Shared Folders**
   - If different permission sets:
     - Confirmation modal showing permission changes
   - If same permission set:
     - Allow without confirmation

**Sorting & Filtering**:

- Add filter: "Shared with me" (shows only folders user doesn't own)
- Sort option: "Shared folders first"
- Search: Include collaborator emails in search

**Design Notes**:
- Keep visual clutter minimal (badges only when relevant)
- Use consistent iconography across app
- Confirmation modals prevent data loss from accidental moves
- Permission changes are explicit and visible

---

## Sprint Breakdown

### Sprint Structure

- **Total Duration**: 10-12 days
- **Team**: 1 full-stack developer
- **Daily Standup**: Review progress, blockers
- **Mid-sprint Review**: Day 6 - demo progress
- **Sprint Retrospective**: End of sprint

---

### Phase 1: Backend Foundation (3-4 days)

**Day 1-2: Database & Core API**

- **Task 1.1**: Create database tables
  - Write SQL schema for share_invites table
  - Write SQL schema for share_audit_log table
  - Create indexes for performance
  - Write migration script to update auth.db
  - Test: Verify tables created correctly

- **Task 1.2**: Implement token generation
  - Create crypto utility for secure random tokens
  - Write token validation function (format, uniqueness)
  - Test: Generate 1000 tokens, verify uniqueness
  - Test: Verify token format (64 hex chars)

- **Task 1.3**: Build invite generation endpoint
  - Implement POST /api/shares/invite
  - Add request validation (Zod schema)
  - Add authorization check (user owns folder)
  - Implement database insert (atomic transaction)
  - Implement audit logging
  - Test: Unit tests for validation
  - Test: Integration test for full flow
  - Test: Error cases (unauthorized, invalid input)

**Day 3: Invite Acceptance & Validation**

- **Task 1.4**: Build validation endpoint
  - Implement GET /api/shares/validate/:token
  - Add token lookup and expiration check
  - Fetch folder metadata from Jazz
  - Test: Valid token returns correct data
  - Test: Expired token returns error
  - Test: Non-existent token returns error

- **Task 1.5**: Build acceptance endpoint
  - Implement POST /api/shares/accept
  - Add email validation (logged-in email matches)
  - Add token re-validation (race condition check)
  - Update database (accepted_at, accepted_by_user_id)
  - Test: Successful acceptance flow
  - Test: Email mismatch rejection
  - Test: Already-accepted token rejection

**Day 4: Permission Management API**

- **Task 1.6**: Build collaborator endpoints
  - Implement GET /api/shares/folders/:id/collaborators
  - Implement PUT /api/shares/folders/:id/collaborators/:userId
  - Implement DELETE /api/shares/folders/:id/collaborators/:userId
  - Add authorization checks
  - Test: CRUD operations for collaborators
  - Test: Authorization enforcement

- **Task 1.7**: Build invite management endpoints
  - Implement GET /api/shares/folders/:id/invites
  - Implement DELETE /api/shares/invites/:token
  - Test: List pending invites
  - Test: Revoke invite

- **Task 1.8**: Add rate limiting
  - Implement rate limiter middleware
  - Apply to invite generation (10/min per user)
  - Apply to validation (20/min per IP)
  - Test: Rate limit enforcement

**Deliverables**:
- ✅ Database schema in place
- ✅ All 8 API endpoints functional
- ✅ 90%+ test coverage on backend
- ✅ Rate limiting active
- ✅ Audit logging working

---

### Phase 2: Jazz Schema Extension (2 days)

**Day 5: Schema Design & Implementation**

- **Task 2.1**: Create groups.ts schema file
  - Define FolderAccessGroup (co.group)
  - Define MemberPermission (co.map)
  - Define PermissionLevel type
  - Document schema purpose and usage
  - Test: Create instances in test environment

- **Task 2.2**: Extend FolderNode schema
  - Add accessGroup field (co.optional)
  - Add permissions field (CoList)
  - Add shareSettings field (z.optional)
  - Update TypeScript types
  - Test: Existing folders still work (backwards compat)
  - Test: New fields can be set

**Day 6: Permission Logic & Helpers**

- **Task 2.3**: Implement permission checking
  - Write hasPermission() helper
  - Write getEffectivePermission() helper
  - Implement inheritance logic
  - Handle edge cases (orphaned permissions, deleted users)
  - Test: Direct permission checks
  - Test: Inherited permission checks
  - Test: Explicit overrides inherited

- **Task 2.4**: Integrate Jazz with backend API
  - Update accept endpoint to create accessGroup
  - Update accept endpoint to add user to group
  - Update permission endpoints to modify Jazz CoValues
  - Update revoke endpoint to remove from group
  - Test: End-to-end flow (invite → accept → Jazz updated)
  - Test: Permission changes propagate via Jazz sync

**Deliverables**:
- ✅ Jazz schemas extended
- ✅ Permission checking logic working
- ✅ Backend ↔ Jazz integration complete
- ✅ Real-time sync tested

---

### Phase 3: Service Layer (1 day)

**Day 7: Sharing Service**

- **Task 3.1**: Create sharingService.ts
  - Implement createInvites()
  - Implement validateInvite()
  - Implement acceptInvite()
  - Implement hasPermission()
  - Implement getEffectivePermission()
  - Implement updatePermission()
  - Implement revokeAccess()
  - Implement getSharedFolders()
  - Document all functions with JSDoc
  - Test: Unit tests for each function
  - Test: Integration with folderService

- **Task 3.2**: Integrate with existing services
  - Update folderService to check permissions
  - Update templateService to check permissions
  - Update sessionService to check permissions
  - Add permission checks to delete/rename operations
  - Test: Permission enforcement in services
  - Test: Error messages for unauthorized actions

**Deliverables**:
- ✅ sharingService fully implemented
- ✅ Permission checks in all data operations
- ✅ Clear error messages for unauthorized actions

---

### Phase 4: Frontend - Invite Generation (2 days)

**Day 8: ShareDialog Component**

- **Task 4.1**: Build ShareDialog UI
  - Create ShareDialog.tsx component
  - Implement multi-email input (chip component)
  - Implement permission selector (radio group)
  - Implement expiration selector (dropdown + custom)
  - Implement inheritance toggle
  - Implement optional message field
  - Add form validation (Zod schema)
  - Style with Tailwind + Radix UI
  - Test: Component renders correctly
  - Test: Form validation works

- **Task 4.2**: Connect to backend API
  - Implement invite generation API call
  - Handle loading state
  - Handle error states (display errors inline)
  - Handle success state (show share URLs)
  - Implement copy-to-clipboard
  - Implement mailto: link generation
  - Test: Successful invite generation
  - Test: Error handling (network, validation, auth)

**Day 9: Integration with Folder Tree**

- **Task 4.3**: Add Share menu items
  - Add "Share..." to folder context menu
  - Add share icon button to folder toolbar
  - Add keyboard shortcut (Cmd+Shift+S)
  - Only show for folders user owns/admins
  - Test: Menu items appear correctly
  - Test: Dialog opens with correct folder

- **Task 4.4**: Polish & accessibility
  - Implement focus management
  - Add ARIA labels
  - Test keyboard navigation
  - Test screen reader compatibility
  - Add success toasts
  - Add loading spinners

**Deliverables**:
- ✅ ShareDialog fully functional
- ✅ Invite generation end-to-end working
- ✅ Accessible and polished UI

---

### Phase 5: Frontend - Invite Acceptance (2 days)

**Day 10: Invite Acceptance Flow**

- **Task 5.1**: Create InviteAcceptPage component
  - Create /invite/:token route
  - Implement loading state
  - Implement authentication check
  - Implement validation API call
  - Implement preview UI (shows invite details)
  - Style with centered card layout
  - Test: Component renders for valid token
  - Test: Redirects to login if not authenticated

- **Task 5.2**: Build acceptance logic
  - Implement acceptance API call
  - Handle email mismatch error
  - Handle success state
  - Implement redirect to folder on success
  - Preserve token during login redirect
  - Test: Successful acceptance flow
  - Test: Email mismatch handling
  - Test: Error state handling

**Day 11: Error Handling & Edge Cases**

- **Task 5.3**: Handle all error states
  - Expired token UI
  - Already accepted UI
  - Revoked token UI
  - Not found UI
  - Network error UI
  - Test each error state

- **Task 5.4**: Polish acceptance flow
  - Add animations (Framer Motion)
  - Add success confetti/celebration
  - Implement auto-redirect after success
  - Add "Go to Folder" button
  - Test complete user journey

**Deliverables**:
- ✅ Invite acceptance fully working
- ✅ All error states handled gracefully
- ✅ Polished user experience

---

### Phase 6: Frontend - Permission Management (2 days)

**Day 12: ManageAccessDialog Component**

- **Task 6.1**: Build ManageAccessDialog UI
  - Create ManageAccessDialog.tsx component
  - Implement owner section (read-only)
  - Implement collaborators section (list with actions)
  - Implement pending invites section (collapsible)
  - Add permission dropdown for each collaborator
  - Add remove button with confirmation
  - Style with cards layout
  - Test: Component renders with data
  - Test: UI updates on data changes

- **Task 6.2**: Connect to backend APIs
  - Fetch collaborators on open
  - Fetch pending invites on open
  - Implement permission update (on dropdown change)
  - Implement remove collaborator (with confirmation)
  - Implement revoke invite
  - Handle loading/error states
  - Test: CRUD operations work
  - Test: Real-time updates via Jazz

**Day 13: Folder Tree Integration**

- **Task 6.3**: Add visual indicators to tree
  - Add people badge to shared folders
  - Add count to badge
  - Add permission badge for non-owned folders
  - Add inherited permission indicator
  - Implement tooltips
  - Test: Badges appear correctly
  - Test: Visual hierarchy clear

- **Task 6.4**: Extend context menu
  - Add "Manage Access" menu item
  - Add "Leave Folder" for collaborators
  - Show collaborator count in menu
  - Test: Menu items work correctly
  - Test: Authorization checked

**Deliverables**:
- ✅ ManageAccessDialog fully functional
- ✅ Folder tree shows sharing status
- ✅ Complete permission management UI

---

### Phase 7: Drag-and-Drop & Polish (1 day)

**Day 14: Finalization**

- **Task 7.1**: Implement drag-and-drop warnings
  - Detect when dragging into/out of shared folder
  - Show confirmation modal with permission changes
  - Implement "Move & Share" logic
  - Implement "Move & Unshare" logic
  - Test: Confirmation modals appear
  - Test: Permissions updated correctly

- **Task 7.2**: Configuration & settings
  - Create sharing config file
  - Add default expiration to user settings (future)
  - Document configuration options
  - Test: Config values respected

- **Task 7.3**: Final polish
  - Review all UI components for consistency
  - Fix any visual bugs
  - Optimize performance (lazy loading, caching)
  - Add error boundaries
  - Write user-facing documentation

- **Task 7.4**: End-to-end testing
  - Test complete sharing workflow (invite → accept → collaborate)
  - Test permission changes propagate in real-time
  - Test offline/online scenarios
  - Test with multiple users simultaneously
  - Test edge cases (deleted folders, revoked access)

**Deliverables**:
- ✅ Drag-and-drop warnings working
- ✅ All UI polished and consistent
- ✅ Full feature tested end-to-end
- ✅ Documentation complete

---

## Success Criteria

### Functional Completeness

- [ ] Owner can generate invite links for folders
- [ ] Invites are email-specific and validated on acceptance
- [ ] Recipients can accept invites and gain folder access
- [ ] Real-time collaboration works via Jazz sync
- [ ] Three permission levels (view/edit/admin) enforced
- [ ] Owner can change collaborator permissions
- [ ] Owner can remove collaborators
- [ ] Owner can revoke pending invites
- [ ] Permission inheritance works for subfolders
- [ ] Folder tree shows sharing status visually
- [ ] Drag-and-drop warns about permission changes

### Performance

- [ ] Invite generation completes in < 2 seconds
- [ ] Invite acceptance completes in < 3 seconds
- [ ] Permission changes propagate in < 1 second via Jazz
- [ ] UI remains responsive with 100+ collaborators
- [ ] Database queries use indexes (< 50ms)
- [ ] Frontend bundle size increase < 50KB (gzipped)

### Security

- [ ] Tokens use cryptographically secure randomness
- [ ] Email validation strictly enforced server-side
- [ ] Expired invites cannot be accepted
- [ ] Revoked invites cannot be accepted
- [ ] All endpoints require authentication
- [ ] Authorization checked on every operation
- [ ] Rate limiting prevents abuse
- [ ] Audit log captures all sharing actions

### User Experience

- [ ] Invite generation flow is intuitive (< 30 seconds)
- [ ] Error messages are clear and actionable
- [ ] Success states provide positive feedback
- [ ] All UI components are accessible (WCAG AA)
- [ ] Keyboard navigation works throughout
- [ ] Mobile-responsive on all screen sizes
- [ ] Loading states show progress
- [ ] No breaking changes to existing workflows

### Code Quality

- [ ] Backend test coverage > 90%
- [ ] Frontend test coverage > 80%
- [ ] All functions documented with JSDoc
- [ ] TypeScript strict mode enabled, no any types
- [ ] Linter passes (Biome)
- [ ] Type checks pass
- [ ] No console errors or warnings
- [ ] Code reviewed and approved

---

## Testing Strategy

### Unit Tests

**Backend**:
- Token generation uniqueness and format
- Database CRUD operations
- Validation functions (email, expiration, permissions)
- Authorization checks
- Audit logging
- Rate limiting logic

**Frontend**:
- Form validation (ShareDialog)
- Email chip component
- Permission dropdown component
- API client functions
- Permission checking helpers
- Date formatting utilities

**Jazz**:
- Schema creation and updates
- Permission inheritance logic
- Group membership operations
- CoValue sync behavior

### Integration Tests

**Backend API**:
- Full invite generation flow (request → database → response)
- Full acceptance flow (validate → accept → Jazz update)
- Permission update flow (API → Jazz → sync)
- Revocation flow (database + Jazz cleanup)
- Error handling (invalid tokens, expired, etc.)

**Frontend Flows**:
- Share dialog: Open → fill → submit → display results
- Invite accept: Click link → login → accept → redirect
- Manage access: Open → update permission → verify change
- Folder tree: Visual indicators update on sharing changes

### End-to-End Tests (Playwright)

**Scenario 1: Successful Sharing**
1. User A logs in
2. User A creates folder "Test Folder"
3. User A opens Share dialog
4. User A enters User B's email
5. User A generates invite
6. User A copies share link
7. User B opens share link in new browser
8. User B logs in (if not already)
9. User B accepts invite
10. User B sees folder in tree
11. User B adds item to folder
12. User A sees item appear in real-time

**Scenario 2: Permission Levels**
1. User A shares folder with User B (view permission)
2. User B opens folder
3. User B attempts to edit item → blocked
4. User A changes User B's permission to edit
5. User B refreshes
6. User B successfully edits item

**Scenario 3: Revocation**
1. User A shares folder with User B
2. User B accepts invite
3. User A opens Manage Access
4. User A removes User B
5. User B refreshes
6. User B no longer sees folder

**Scenario 4: Expiration**
1. User A generates invite with 1-minute expiration
2. Wait 61 seconds
3. User B clicks invite link
4. User B sees "expired" error
5. User B cannot accept

**Scenario 5: Email Mismatch**
1. User A generates invite for userB@example.com
2. User C logs in as userC@example.com
3. User C clicks invite link
4. User C sees email mismatch error
5. User C cannot accept

### Performance Tests

**Load Testing**:
- Generate 1000 invites concurrently (measure response time)
- 100 users accepting invites simultaneously (measure database load)
- Folder with 500 collaborators (measure UI render time)
- Permission check with 10-level folder hierarchy (measure computation time)

**Stress Testing**:
- Rate limiter under sustained high load
- Database connection pool under concurrent requests
- Jazz sync with 50 concurrent collaborators editing

### Manual Testing Checklist

**Cross-browser**:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Mobile**:
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Responsive breakpoints (375px, 768px, 1024px)

**Accessibility**:
- [ ] Screen reader (NVDA/JAWS)
- [ ] Keyboard-only navigation
- [ ] High contrast mode
- [ ] 200% zoom

**Edge Cases**:
- [ ] Offline acceptance (should queue)
- [ ] Network interruption during acceptance
- [ ] User deleted after invite sent
- [ ] Folder deleted after invite sent
- [ ] Simultaneous permission changes by multiple admins

---

## Security Considerations

### Token Security

**Requirements**:
- Use `crypto.randomBytes(32)` for token generation
- Minimum 256 bits of entropy
- URL-safe encoding (hex or base64url)
- One-time use (cannot be reused after acceptance)
- Server-side validation only (never trust client)

**Implementation**:
```
Token format: 64 hexadecimal characters
Example: a3f8c29b1e4d5f6a0c9b8e7d2a1f3c5b9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b

Storage: SQLite database, indexed for fast lookup
Lifetime: Configurable (default 7 days)
Expiration: Hard enforced (not just client-side warning)
```

**Threat Mitigation**:
- Brute force: 2^256 combinations = infeasible
- Token prediction: Cryptographically random = impossible
- Token reuse: Database tracks acceptance, rejects duplicates
- Replay attacks: One-time use prevents replays

### Email Validation

**Requirements**:
- Validate email format (RFC 5322)
- Case-insensitive comparison
- Trim whitespace
- Prevent homoglyph attacks (future enhancement)

**Implementation**:
```
Server-side validation steps:
1. Parse email with RFC-compliant parser
2. Normalize: toLowerCase(), trim()
3. Compare with logged-in user's email (normalized)
4. Reject if mismatch

Client-side validation (for UX only):
1. Real-time format check
2. Highlight invalid emails
3. Cannot submit with invalid emails
```

**Threat Mitigation**:
- Phishing: Email-specific invites prevent forwarding
- Social engineering: Recipient must be authenticated
- Account takeover: Session validation required

### Authorization Checks

**Principle**: Verify every operation server-side

**Implementation**:
```
For every API endpoint:
1. Verify user is authenticated (session cookie)
2. Verify user has permission for action
   - Invite generation: User owns or admins folder
   - Permission change: User owns or admins folder
   - Remove collaborator: User owns or admins folder (owner for admins)
   - Accept invite: User email matches invite
3. Reject with 403 if unauthorized
```

**Permission Hierarchy**:
```
Operation              | Required Permission
-----------------------|--------------------
View folder/items      | view+
Edit items/sessions    | edit+
Share folder           | admin or owner
Manage permissions     | admin or owner
Delete folder          | owner only
Transfer ownership     | owner only (future)
```

### Rate Limiting

**Goals**:
- Prevent invite spam
- Prevent brute force token guessing
- Prevent DoS attacks

**Implementation**:
```
Endpoint                          | Limit
----------------------------------|------------------
POST /api/shares/invite           | 10/minute per user
GET /api/shares/validate/:token   | 20/minute per IP
POST /api/shares/accept           | 5/minute per user
PUT .../collaborators/:id         | 30/minute per user
DELETE .../collaborators/:id      | 30/minute per user
```

**Strategy**:
- Use in-memory store (Redis for production scaling)
- Sliding window algorithm
- Return 429 status with Retry-After header
- Log rate limit violations for monitoring

### Audit Logging

**Purpose**:
- Security monitoring
- Compliance (future: GDPR audit trail)
- Debugging
- User transparency

**What to Log**:
```
Event                | Data Logged
---------------------|----------------------------------------
invite_created       | actor, recipient, folder, permission, expiration
invite_accepted      | actor, token, folder, permission
invite_revoked       | actor, token, recipient
permission_changed   | actor, target_user, folder, old_perm, new_perm
access_revoked       | actor, target_user, folder
folder_shared        | actor, folder, parent_folder (inheritance)
```

**Storage**:
- SQLite table: share_audit_log
- Indexed by: folder_id, actor_id, created_at
- Retention: Indefinite (or configurable per compliance needs)
- No PII redaction (internal audit only)

**Access**:
- Admin dashboard (future): View audit log for any folder
- User view (future): See who accessed their shared folders
- API endpoint (future): Export audit log

### Data Privacy

**Considerations**:
- Email addresses are PII (handle per GDPR/CCPA)
- Audit logs contain user actions (retention policy needed)
- Share tokens are bearer tokens (treat as sensitive)

**Implementation**:
- HTTPS required for all API calls
- Secure cookies (httpOnly, secure, sameSite)
- No tokens in client-side localStorage
- Tokens in URL (unavoidable, but one-time use)
- No email addresses in client logs

### Future Security Enhancements

**Short-term** (next sprint):
- CAPTCHA on invite acceptance (prevent bot abuse)
- Suspicious activity alerts (owner notified of unusual access)
- IP geofencing (optional: restrict acceptance by location)

**Long-term**:
- End-to-end encryption keys per folder (Jazz supports this)
- Multi-factor authentication requirement for admin actions
- Temporary access grants (time-limited permissions)
- Access audit trail visible to collaborators

---

## Future Enhancements

### Phase 2 Features (Post-Launch)

**Public Sharing**:
- Generate public link (anyone with link can view)
- Optional password protection
- Configurable view-only or allow-copy
- Expiration and view count limits
- Revocable public links

**Advanced Permissions**:
- Custom permission sets (e.g., "can view items but not sessions")
- Role-based access (team admin, contributor, viewer)
- Permission templates (apply preset to multiple users)

**Team/Organization Features**:
- Organization accounts (shared billing, central admin)
- Team workspaces (shared folder hierarchies)
- Role inheritance across folders
- Centralized user management

**Notification System**:
- Email notifications for invite (optional, user pref)
- In-app notifications for permission changes
- Digest emails for collaboration activity
- Real-time toast notifications for collaborator edits

**Collaboration Enhancements**:
- Real-time cursors (see who's viewing same item)
- Comments on items (discussions)
- Activity feed (who added/edited what)
- Version history (undo/redo across users)
- Conflict resolution UI (when simultaneous edits)

**User Management**:
- Bulk invite (CSV upload of emails)
- User groups (share with entire group)
- Transfer ownership (give folder to another user)
- Delegate admin (temporary admin permission)

**Analytics & Insights**:
- Folder activity dashboard (most active collaborators)
- Usage statistics (items added, sessions completed)
- Collaboration heatmap (when people edit)
- Export access logs

### Technical Debt & Improvements

**Scalability**:
- Move to PostgreSQL for production (SQLite limits)
- Add Redis for rate limiting and caching
- Implement database connection pooling
- Add database query optimization (EXPLAIN analysis)

**Performance**:
- Lazy load collaborator list (pagination for 500+)
- Cache folder metadata (reduce Jazz queries)
- Optimize permission inheritance calculation
- Add service worker for offline invite acceptance

**Developer Experience**:
- Generate OpenAPI spec for API
- Add Postman collection for testing
- Create developer documentation
- Add API versioning (v1, v2)

**Monitoring & Observability**:
- Add application logging (Winston/Pino)
- Add error tracking (Sentry)
- Add performance monitoring (New Relic)
- Create health check dashboard

---

## Notes & Decisions

### Design Decisions

**1. Why SQLite for invite tokens?**
- Audit trail needs persistence (not in Jazz)
- Centralized validation (not distributed)
- Relational queries (find by folder, email, etc.)
- BetterAuth already uses SQLite (consistency)

**2. Why not use Jazz's built-in invites entirely?**
- Jazz invites are not email-specific (anyone with link)
- Need audit logging (who invited whom)
- Need expiration enforcement (Jazz doesn't support)
- Need revocation before acceptance (Jazz doesn't support)

**3. Why separate Jazz groups from permission metadata?**
- Jazz groups handle access control (cryptographic)
- Metadata (addedBy, addedAt) is application-level
- Separation of concerns (sync vs. business logic)
- Allows richer permission models in future

**4. Why not automated email sending?**
- Complexity: Email service, templates, deliverability
- Spam concerns: User-sent emails less likely flagged
- Flexibility: User can customize message per recipient
- Scope: MVP focuses on core sharing, not email infrastructure

**5. Why three permission levels?**
- View: Common use case (read-only sharing)
- Edit: Enables collaboration (most use cases)
- Admin: Delegates management (for teams)
- Avoids complexity of 10+ granular permissions
- Can expand later if needed

### Open Questions

**Q1: Should invites support multiple folders at once?**
- Use case: "Share all my grocery store templates with spouse"
- Complexity: UI becomes more complex
- Decision: **Phase 2** - Start with single folder, add batch sharing later

**Q2: Should we support "share with anyone at domain"?**
- Example: "Share with anyone at @company.com"
- Use case: Corporate environments
- Security: Requires domain verification
- Decision: **Future** - Not MVP, consider for organization features

**Q3: Should removed collaborators retain read-only access?**
- Pros: Less disruptive, historical context preserved
- Cons: Not true revocation, confusing UX
- Decision: **Hard revocation** - Complete access removal

**Q4: Should we support folder visibility without edit access?**
- Example: User sees folder in tree but grayed out (view-only)
- Pros: Clear hierarchy, discoverable
- Cons: Clutters tree if many shared folders
- Decision: **Show all accessible folders** - View permission shows folder

**Q5: How to handle folder deletion when shared?**
- Option A: Archive for owner, remain accessible for collaborators
- Option B: Delete for everyone immediately
- Option C: Prompt owner to transfer ownership first
- Decision: **Option A** - Owner soft-deletes, collaborators lose access gracefully

### Technical Constraints

**Jazz Limitations**:
- Cannot revoke access instantly (requires group removal, syncs async)
- No built-in role hierarchy (we manage with metadata)
- Group membership is binary (member or not, we add permission levels)

**BetterAuth Limitations**:
- Email is primary identifier (cannot change easily)
- Session management is cookie-based (not JWT)
- No built-in role system (we implement custom)

**Frontend Constraints**:
- React 18 concurrent mode (ensure state updates are batched)
- Vite HMR (test hot reload with Jazz CoValues)
- Bundle size (lazy load share components)

### Dependencies

**New Dependencies**:
```
Backend:
- None (use built-in Node.js crypto)

Frontend:
- None (use existing Radix UI components)
```

**Updated Dependencies**:
- Jazz.tools: Ensure v0.18.33+ (group support)
- BetterAuth: Ensure v1.x (stable)

### Risks & Mitigation

**Risk 1: Jazz sync delay causes UI inconsistency**
- Impact: User sees stale permission data
- Likelihood: Medium
- Mitigation: Show loading state during sync, optimistic updates with rollback

**Risk 2: Database performance with large audit logs**
- Impact: Slow queries on folders with thousands of invite events
- Likelihood: Low (typical folder < 100 events)
- Mitigation: Add database indexes, pagination, archival strategy

**Risk 3: Token guessing via brute force**
- Impact: Unauthorized access to folders
- Likelihood: Very low (2^256 combinations)
- Mitigation: Rate limiting, monitoring for suspicious patterns

**Risk 4: User confusion about permission levels**
- Impact: Users grant wrong permissions, security issues
- Likelihood: Medium
- Mitigation: Clear descriptions, confirmation modals, help documentation

**Risk 5: Scope creep (requests for advanced features)**
- Impact: Sprint extends beyond 2 weeks
- Likelihood: High
- Mitigation: Strict adherence to MVP scope, document Phase 2 requests

---

## Conclusion

This sprint will deliver a complete, secure, email-validated folder sharing system that integrates seamlessly with Jazz.tools' real-time collaboration and BetterAuth's authentication. The design prioritizes security (email validation, token expiration, audit logging), user experience (clear workflows, visual indicators, accessibility), and maintainability (service layer abstraction, comprehensive testing).

The phased approach ensures incremental progress with testable milestones at each stage. By leveraging existing infrastructure (Jazz groups, BetterAuth users, SQLite database) and following established patterns (service layer, dialog components, Radix UI), the implementation minimizes technical debt and complexity.

Upon completion, users will be able to:
1. Generate secure, email-specific share links with configurable permissions and expiration
2. Accept invites and immediately collaborate in real-time via Jazz sync
3. Manage collaborators with fine-grained permission control
4. Visualize sharing status throughout the folder tree
5. Safely move folders between personal and shared contexts

The foundation laid by this sprint enables future enhancements (public links, teams, notifications, analytics) while maintaining a clean, secure, and user-friendly MVP.

---

**Document Version**: 1.0
**Last Updated**: 2025-11-18
**Author**: System Design
**Status**: Ready for Implementation

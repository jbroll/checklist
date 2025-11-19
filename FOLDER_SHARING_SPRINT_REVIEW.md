# Folder Sharing Sprint - Review & Refinement Analysis

**Date**: 2025-11-19
**Status**: Pre-Implementation Review
**Document Reviewed**: FOLDER_SHARING_SPRINT.md v1.0

---

## Executive Summary

This document provides a comprehensive review of the FOLDER_SHARING_SPRINT.md specification against the actual bubblelist codebase. The review identifies **10 critical gaps**, **8 inconsistencies**, and **15 refinements** needed before implementation.

**Overall Assessment**: The sprint document is well-structured and comprehensive, but requires significant updates to align with the actual codebase architecture and patterns.

**Recommendation**: **Revise before implementation** - Address critical items before starting development.

---

## 1. Critical Gaps

### 1.1 Jazz Group Management from Backend (CRITICAL)

**Issue**: The document assumes Jazz groups can be managed from the Express backend, but Jazz groups are **client-side** CoValues that require a Jazz account context.

**Current State**:
- Jazz CoValues (including groups) are typically managed client-side with `useAccount()` hook
- Backend has no direct access to Jazz's distributed database

**Impact**: The entire invite acceptance flow (Phase 1, Task 1.5) cannot be implemented as specified.

**Recommendation**:
```
Option 1 (Preferred): Hybrid approach
  - Backend: Validate invite token, store acceptance in SQLite
  - Frontend: After backend validation, add user to Jazz group client-side
  - Flow: POST /api/shares/accept → returns success → frontend updates Jazz

Option 2: Backend Jazz Account
  - Create admin Jazz account for backend
  - Backend manages groups on behalf of users
  - Requires significant Jazz setup and security considerations
```

**Updated Flow**:
```
POST /api/shares/accept
  ↓
Backend validates token + email
  ↓
Backend marks invite as accepted in database
  ↓
Backend returns: { success: true, folderId, permission }
  ↓
Frontend receives response
  ↓
Frontend adds current user to folder.accessGroup (Jazz)
  ↓
Frontend creates MemberPermission record (Jazz)
  ↓
Success!
```

---

### 1.2 Missing Routing Infrastructure

**Issue**: Document specifies `/invite/:token` route but codebase has no router.

**Current State**:
- `src/App.tsx` uses simple `window.location.pathname` checking
- Only `/test` route exists
- No React Router dependency in package.json

**Impact**:
- Cannot implement invite acceptance page as specified (Phase 5)
- Need to add routing library or use pathname checking

**Recommendation**:
```
Option 1: Add React Router (recommended for scalability)
  - Install: react-router-dom
  - Wrap app with BrowserRouter
  - Define routes for /invite/:token, /folder/:id, etc.

Option 2: Pathname-based routing (minimal, matches current pattern)
  - Parse window.location.pathname in App.tsx
  - Extract token from path
  - Render InviteAcceptPage when path matches /invite/*
```

**Code Example** (Option 2 - minimal):
```typescript
// In App.tsx
const path = window.location.pathname;
const inviteMatch = path.match(/^\/invite\/(.+)$/);

if (inviteMatch) {
  const token = inviteMatch[1];
  return <InviteAcceptPage token={token} />;
}
```

---

### 1.3 Database Path & Migration

**Issue**: Document mentions `./auth.db` but doesn't specify it's in the backend directory.

**Current State**:
- `backend/src/auth.ts` creates database at `./auth.db` (relative to backend directory)
- Actual path: `/home/user/bubblelist/backend/auth.db`
- Frontend has no direct database access

**Impact**:
- Migration scripts may create database in wrong location
- Developers may be confused about where to find auth.db

**Recommendation**:
```
Update all references to specify:
  - Path: backend/auth.db (from project root)
  - Migration script location: backend/src/migrations/
  - Add to .gitignore: backend/auth.db
```

---

### 1.4 Rate Limiting Implementation

**Issue**: Document specifies rate limiting but no implementation details or dependencies.

**Current State**:
- No rate limiting middleware in `backend/src/index.ts`
- No rate limiting library in `backend/package.json`

**Impact**:
- Cannot implement Task 1.8 without additional dependencies
- Security vulnerability if not implemented

**Recommendation**:
```
Add dependency: express-rate-limit
Backend package.json:
  "dependencies": {
    "express-rate-limit": "^7.1.5"
  }

Implementation:
  import rateLimit from 'express-rate-limit';

  const inviteLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Too many invites created, try again later'
  });

  app.post('/api/shares/invite', inviteLimiter, async (req, res) => {
    // ...
  });
```

---

### 1.5 Kysely Integration for Database Queries

**Issue**: Document doesn't mention using Kysely for type-safe queries.

**Current State**:
- `backend/package.json` already includes `kysely: ^0.28.8`
- BetterAuth uses better-sqlite3 directly
- No Kysely schema defined for share tables

**Impact**:
- Inconsistent query patterns
- Missing type safety for share tables
- Potential SQL injection if using raw queries

**Recommendation**:
```
Define Kysely schema in backend/src/database.ts:

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';

interface ShareInvite {
  id: number;
  token: string;
  owner_id: string;
  owner_email: string;
  recipient_email: string;
  folder_id: string;
  permission_level: 'view' | 'edit' | 'admin';
  expires_at: number | null;
  created_at: number;
  accepted_at: number | null;
  accepted_by_user_id: string | null;
  revoked_at: number | null;
}

interface ShareAuditLog {
  id: number;
  action: string;
  actor_id: string;
  target_user_id: string | null;
  folder_id: string;
  metadata: string | null;
  created_at: number;
}

interface Database {
  share_invites: ShareInvite;
  share_audit_log: ShareAuditLog;
}

export const db = new Kysely<Database>({
  dialect: new SqliteDialect({
    database: new Database('./auth.db'),
  }),
});
```

---

### 1.6 Jazz Schema Syntax for Groups

**Issue**: Document shows incomplete Jazz group schema syntax.

**Current State**:
- Jazz v0.18.33 uses `co.group()` for groups
- Document line 358 mentions `FolderAccessGroup` as `co.group` but no implementation
- No example of how to create/manage groups with Jazz v0.18.x syntax

**Impact**:
- Phase 2 (Tasks 2.1-2.2) cannot be implemented without correct syntax
- Developer confusion

**Recommendation**:
```typescript
// src/schemas/groups.ts

import { co, z } from 'jazz-tools';

/**
 * FolderAccessGroup - Jazz Group for folder access control
 *
 * Jazz automatically manages group membership.
 * Members of this group can access the associated folder.
 */
export const FolderAccessGroup = co.group();

/**
 * MemberPermission - Metadata about a collaborator's permission
 *
 * Stored as a CoMap, references the group member and permission level.
 */
export const MemberPermission = co.map({
  accountId: z.string(), // Jazz Account ID (co_xxx format)
  permission: z.enum(['view', 'edit', 'admin']),
  addedBy: z.string(), // Account ID who granted access
  addedAt: z.date(),
});

/**
 * ShareSettings - Configuration for folder sharing behavior
 */
export const ShareSettings = co.map({
  allowSubfolderInheritance: z.boolean(),
  defaultExpirationDays: z.optional(z.number()),
});
```

**Usage Example**:
```typescript
// Creating a group when first invite is accepted
const accessGroup = FolderAccessGroup.create({ owner: folder.owner });
folder.$jazz.set('accessGroup', accessGroup);

// Adding a member to the group
accessGroup.addMember('everyone', 'reader', recipient);

// Creating permission metadata
const permission = MemberPermission.create({
  accountId: recipient.$jazz.id,
  permission: 'edit',
  addedBy: owner.$jazz.id,
  addedAt: new Date(),
}, { owner: folder.owner });

folder.permissions.$jazz.push(permission);
```

**Note**: Jazz groups in v0.18.x use role-based access. The three roles are:
- `reader`: Can read the CoValue
- `writer`: Can read and write
- `admin`: Can read, write, and manage group membership

We'll map our permissions to Jazz roles as follows:
- `view` → Jazz `reader`
- `edit` → Jazz `writer`
- `admin` → Jazz `admin`

---

### 1.7 FolderNode Schema Extension Conflicts

**Issue**: Document proposes adding `accessGroup`, `permissions`, and `shareSettings` fields to FolderNode, but current schema is already complex.

**Current State**:
```typescript
// src/schemas/tree.ts lines 78-143
export const FolderNode: any = co.map({
  name: z.string(),
  expanded: z.boolean(),
  archived: z.boolean(),
  children: co.optional(co.list(FolderNode)), // Organizational folders
  items: z.optional(z.array(...)), // Template folders
  sessions: z.optional(z.array(...)), // Template folders
  showZoneHeadings: z.optional(z.boolean()),
  parent: co.optional(FolderNode),
  owner: Account,
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

**Impact**:
- Adding more fields increases schema complexity
- Mixing sharing fields with folder structure may cause confusion
- Need to ensure backward compatibility

**Recommendation**:
```typescript
// Extend FolderNode with new optional fields
export const FolderNode: any = co.map({
  // ... existing fields ...

  // Sharing fields (optional, only set when folder is shared)
  get accessGroup() {
    return co.optional(FolderAccessGroup);
  },
  permissions: z.optional(
    z.array(
      z.object({
        accountId: z.string(),
        permission: z.enum(['view', 'edit', 'admin']),
        addedBy: z.string(),
        addedAt: z.date(),
      })
    )
  ),
  shareSettings: z.optional(
    z.object({
      allowSubfolderInheritance: z.boolean(),
      defaultExpirationDays: z.optional(z.number()),
    })
  ),
});
```

**Migration Strategy**:
1. Existing folders: Fields are undefined (not shared)
2. First share: Initialize accessGroup, permissions = [], shareSettings
3. No breaking changes: Unshared folders work as before

---

### 1.8 Backend Session Management

**Issue**: Document doesn't explain how to verify BetterAuth sessions in new API endpoints.

**Current State**:
- BetterAuth handles `/api/auth/*` routes
- Custom endpoints need to verify session manually
- No middleware shown for auth verification

**Impact**:
- All sharing endpoints need authentication
- Risk of implementing insecure endpoints

**Recommendation**:
```typescript
// backend/src/middleware/auth.ts

import type { Request, Response, NextFunction } from 'express';
import { auth } from '../auth.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Get session from BetterAuth
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required'
    });
  }

  // Attach user to request for use in handlers
  req.user = session.user;
  next();
}

// Usage in endpoints
app.post('/api/shares/invite', requireAuth, async (req, res) => {
  // req.user is guaranteed to exist here
  const userId = req.user.id;
  const userEmail = req.user.email;
  // ...
});
```

---

### 1.9 Folder Ownership Validation

**Issue**: Document doesn't explain how backend validates folder ownership (Jazz CoValues are client-side).

**Current State**:
- Jazz CoValues have `owner` field (Account reference)
- Backend has no access to Jazz CoValues directly
- Need mechanism to verify ownership

**Impact**:
- Authorization checks cannot be implemented as specified
- Security vulnerability if not addressed

**Recommendation**:
```
Option 1: Trust client with signature
  - Frontend signs request with Jazz identity
  - Backend verifies signature
  - Complex, requires crypto implementation

Option 2: Ownership cache in database (Preferred)
  - When folder is created, frontend calls backend to register ownership
  - Backend stores: folder_id → owner_user_id mapping
  - Backend checks this mapping for authorization
  - Requires new table: folder_ownership

Option 3: Fetch from Jazz sync server
  - Backend queries Jazz sync server for folder metadata
  - Requires Jazz sync server API access
  - May have latency/reliability issues
```

**Implementation** (Option 2):
```sql
-- backend/src/migrations/002_folder_ownership.sql
CREATE TABLE IF NOT EXISTS folder_ownership (
  folder_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES user(id)
);

CREATE INDEX idx_folder_ownership_owner ON folder_ownership(owner_user_id);
```

```typescript
// When creating folder (frontend)
const folder = createFolder(account, name, isTemplate, parent);
await fetch('/api/folders/register', {
  method: 'POST',
  body: JSON.stringify({
    folderId: folder.$jazz.id,
    ownerUserId: account.$jazz.id,
  }),
});

// In sharing endpoints (backend)
const ownership = await db
  .selectFrom('folder_ownership')
  .where('folder_id', '=', folderId)
  .selectAll()
  .executeTakeFirst();

if (ownership.owner_user_id !== req.user.id) {
  return res.status(403).json({ error: 'not_owner' });
}
```

---

### 1.10 Missing Multi-User Testing Setup

**Issue**: Document specifies multi-user E2E tests but doesn't explain setup.

**Current State**:
- Playwright is installed (`@playwright/test`)
- E2E tests likely use single user (standard Playwright pattern)
- No documentation on multi-browser/multi-user testing

**Impact**:
- Cannot test sharing flow end-to-end (Phase 7, Task 7.4)
- Critical scenarios (Scenario 1-5) cannot be validated

**Recommendation**:
```typescript
// tests/sharing.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Folder Sharing', () => {
  test('User A shares folder, User B accepts and collaborates', async ({ browser }) => {
    // Create two browser contexts (two users)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // User A logs in
    await pageA.goto('http://localhost:5173');
    await pageA.click('text=Sign in with Google');
    // ... complete OAuth flow for User A

    // User A creates folder and shares
    await pageA.click('text=New Folder');
    await pageA.fill('[name="folder-name"]', 'Test Folder');
    await pageA.click('text=Create');
    await pageA.click('text=Share');
    await pageA.fill('[name="email"]', 'userB@example.com');
    await pageA.click('text=Generate Link');

    // Get share URL
    const shareUrl = await pageA.locator('[data-testid="share-url"]').textContent();

    // User B opens share link
    await pageB.goto(shareUrl);
    await pageB.click('text=Sign in with Google');
    // ... complete OAuth flow for User B
    await pageB.click('text=Accept Invite');

    // Verify User B sees folder
    await expect(pageB.locator('text=Test Folder')).toBeVisible();

    // User B adds item
    await pageB.click('text=Test Folder');
    await pageB.click('text=Add Item');
    await pageB.fill('[name="item-name"]', 'Shared Item');
    await pageB.click('text=Save');

    // Verify User A sees item (real-time sync)
    await pageA.reload();
    await expect(pageA.locator('text=Shared Item')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
```

---

## 2. Inconsistencies

### 2.1 API Endpoint Prefix

**Issue**: Document uses `/api/shares/*` but backend uses `/api/auth/*` pattern.

**Current State**: `backend/src/index.ts` line 50:
```typescript
app.all('/api/auth/*', toNodeHandler(auth));
```

**Recommendation**: Use `/api/shares/*` as specified, but ensure it doesn't conflict with BetterAuth routes.

---

### 2.2 Permission Level Naming

**Issue**: Document uses lowercase `'view'`, `'edit'`, `'admin'` but doesn't match TypeScript enum convention.

**Recommendation**:
```typescript
// Define as const enum for type safety
export const PermissionLevel = {
  VIEW: 'view',
  EDIT: 'edit',
  ADMIN: 'admin',
} as const;

export type PermissionLevel = typeof PermissionLevel[keyof typeof PermissionLevel];
```

---

### 2.3 Timestamp Format

**Issue**: Document mixes Unix timestamps (integers) and ISO strings in examples.

**Current State**: SQLite stores integers, API returns ISO strings.

**Recommendation**:
- Database: Store as INTEGER (Unix timestamp in seconds)
- API responses: Return as ISO 8601 string
- Add conversion utilities

---

### 2.4 Dialog Component Pattern

**Issue**: Document shows generic dialog structure but existing codebase uses specific patterns.

**Current Pattern**: FileUploadDialog wrapper with custom hooks (see ImportDialog.tsx)

**Recommendation**: Create `ShareDialog` using similar pattern:
```typescript
// src/components/sharing/useShareDialog.tsx
export function useShareDialog({ folder, onSuccess }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [permission, setPermission] = useState<PermissionLevel>('edit');
  // ...
}

// src/components/sharing/ShareDialog.tsx
export function ShareDialog({ open, onOpenChange, folder }) {
  const hook = useShareDialog({ folder });
  return <Dialog>...</Dialog>;
}
```

---

### 2.5 Service Layer Function Signatures

**Issue**: Document shows `sharingService.ts` but doesn't match existing service patterns.

**Current Pattern**: Services accept `InstanceOfSchema<typeof Account>` and CoValue instances.

**Recommendation**:
```typescript
// src/services/sharingService.ts
import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, FolderNode } from '../schemas';

export function hasPermission(
  account: InstanceOfSchema<typeof Account>,
  folder: InstanceOfSchema<typeof FolderNode>,
  requiredPermission: PermissionLevel,
): boolean {
  // Check if user is owner
  if (folder.owner.$jazz.id === account.$jazz.id) {
    return true;
  }

  // Check permissions list
  const userPermission = folder.permissions?.find(
    p => p.accountId === account.$jazz.id
  );

  if (!userPermission) return false;

  // Check permission hierarchy
  return hasPermissionLevel(userPermission.permission, requiredPermission);
}

function hasPermissionLevel(
  userLevel: PermissionLevel,
  required: PermissionLevel
): boolean {
  const hierarchy = { view: 0, edit: 1, admin: 2 };
  return hierarchy[userLevel] >= hierarchy[required];
}
```

---

### 2.6 Error Response Format

**Issue**: Document shows different error formats across endpoints.

**Recommendation**: Standardize error responses:
```typescript
interface ErrorResponse {
  error: string; // Machine-readable error code
  message: string; // Human-readable message
  details?: unknown; // Optional additional context
}

// Example
res.status(403).json({
  error: 'forbidden',
  message: 'You do not have permission to share this folder',
  details: { required: 'admin', actual: 'edit' }
});
```

---

### 2.7 Folder Type Terminology

**Issue**: Document uses "template-folder" and "organizational folder" but code uses different checks.

**Current State**: Code uses `isTemplateFolder()` and `isOrganizationalFolder()` helpers.

**Recommendation**: Document should reference these helpers instead of type field:
```typescript
if (isTemplateFolder(folder)) {
  // Only template folders can have sessions
}
```

---

### 2.8 Real-time Update Mechanism

**Issue**: Document claims Jazz sync updates happen "within 1 second" but provides no evidence.

**Reality**: Jazz sync speed depends on network, server load, and data size.

**Recommendation**:
- Remove specific time guarantee
- Document: "Permission changes propagate via Jazz real-time sync (typically < 2 seconds)"
- Add UI loading states to handle delay

---

## 3. Refinements & Enhancements

### 3.1 Add Folder Ownership Registration Endpoint

**New Endpoint**: `POST /api/folders/register`

**Purpose**: Track folder ownership in backend for authorization.

**Why**: Backend needs to know who owns each folder to validate sharing requests.

---

### 3.2 Add Email Validation Utility

**Create**: `backend/src/utils/validation.ts`

```typescript
import { z } from 'zod';

export const emailSchema = z.string().email().toLowerCase().trim();

export function validateEmail(email: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const normalized = emailSchema.parse(email);
    return { valid: true, normalized };
  } catch (error) {
    return { valid: false, error: 'Invalid email format' };
  }
}

export function validateEmails(emails: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const email of emails) {
    const result = validateEmail(email);
    if (result.valid && result.normalized) {
      valid.push(result.normalized);
    } else {
      invalid.push(email);
    }
  }

  return { valid, invalid };
}
```

---

### 3.3 Add Comprehensive Type Definitions

**Create**: `src/types/sharing.ts`

```typescript
export type PermissionLevel = 'view' | 'edit' | 'admin';

export interface InviteRequest {
  folderId: string;
  recipientEmails: string[];
  permissionLevel: PermissionLevel;
  expiresInDays: number | null;
  message?: string;
}

export interface InviteResponse {
  invites: Array<{
    email: string;
    shareUrl: string;
    token: string;
    expiresAt: string | null;
  }>;
}

export interface ValidateInviteResponse {
  valid: boolean;
  invite?: {
    ownerEmail: string;
    ownerName: string;
    folderName: string;
    permissionLevel: PermissionLevel;
    expiresAt: string | null;
  };
  error?: string;
  errorMessage?: string;
}

export interface AcceptInviteRequest {
  token: string;
}

export interface AcceptInviteResponse {
  success: boolean;
  folderId: string;
  folderName: string;
  permissionLevel: PermissionLevel;
}

export interface Collaborator {
  userId: string;
  email: string;
  name: string;
  permission: PermissionLevel;
  addedBy: string;
  addedByEmail: string;
  addedAt: string;
}

export interface PendingInvite {
  token: string;
  recipientEmail: string;
  permission: PermissionLevel;
  createdAt: string;
  expiresAt: string | null;
  createdBy: string;
}
```

---

### 3.4 Add Database Migration Script

**Create**: `backend/src/migrations/001_sharing_tables.sql`

```sql
-- Sharing invites table
CREATE TABLE IF NOT EXISTS share_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('view', 'edit', 'admin')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by_user_id TEXT,
  revoked_at INTEGER,
  FOREIGN KEY (owner_id) REFERENCES user(id),
  FOREIGN KEY (accepted_by_user_id) REFERENCES user(id)
);

CREATE INDEX idx_share_invites_token ON share_invites(token);
CREATE INDEX idx_share_invites_folder_id ON share_invites(folder_id);
CREATE INDEX idx_share_invites_recipient_email ON share_invites(recipient_email);
CREATE INDEX idx_share_invites_expires_at ON share_invites(expires_at) WHERE expires_at IS NOT NULL;

-- Audit log table
CREATE TABLE IF NOT EXISTS share_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_user_id TEXT,
  folder_id TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES user(id),
  FOREIGN KEY (target_user_id) REFERENCES user(id)
);

CREATE INDEX idx_share_audit_log_folder_id ON share_audit_log(folder_id);
CREATE INDEX idx_share_audit_log_actor_id ON share_audit_log(actor_id);
CREATE INDEX idx_share_audit_log_created_at ON share_audit_log(created_at);

-- Folder ownership tracking
CREATE TABLE IF NOT EXISTS folder_ownership (
  folder_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES user(id)
);

CREATE INDEX idx_folder_ownership_owner ON folder_ownership(owner_user_id);
```

---

### 3.5 Update Sprint Timeline

**Current**: 14 days (10-12 days mentioned in header, but breakdown shows 14)

**Issues**:
- Phase 1 (4 days) + Phase 2 (2 days) + Phase 3 (1 day) + Phase 4 (2 days) + Phase 5 (2 days) + Phase 6 (2 days) + Phase 7 (1 day) = 14 days
- Doesn't account for blockers, code review, or bug fixes
- No buffer for addressing gaps identified in this review

**Recommended**: 18-20 days
- Add 2 days at start: Address architectural gaps (routing, backend Jazz access)
- Add 1 day between phases: Code review and testing
- Add 1-2 days at end: Bug fixes and polish

---

### 3.6 Add Security Headers Middleware

**Create**: `backend/src/middleware/security.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// Usage in backend/src/index.ts
app.use(securityHeaders);
```

---

### 3.7 Add Invite Token Cleanup Job

**Purpose**: Periodically delete expired invites to prevent database bloat.

**Create**: `backend/src/jobs/cleanupExpiredInvites.ts`

```typescript
import { db } from '../database.js';

export async function cleanupExpiredInvites() {
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .deleteFrom('share_invites')
    .where('expires_at', '<', now)
    .where('accepted_at', 'is', null)
    .executeTakeFirst();

  console.log(`Cleaned up ${result.numDeletedRows} expired invites`);
}

// Run every hour
setInterval(cleanupExpiredInvites, 60 * 60 * 1000);
```

---

### 3.8 Add Collaborator Count Helper

**Purpose**: Efficiently count collaborators for UI badges.

**Add to**: `src/services/sharingService.ts`

```typescript
export function getCollaboratorCount(
  folder: InstanceOfSchema<typeof FolderNode>
): number {
  if (!folder.permissions) return 0;
  return folder.permissions.filter(p => !p.archived).length;
}

export function isShared(
  folder: InstanceOfSchema<typeof FolderNode>
): boolean {
  return getCollaboratorCount(folder) > 0;
}
```

---

### 3.9 Add Permission Change History

**Enhancement**: Track permission changes in audit log with before/after values.

**Update**: Audit log metadata field should include:
```json
{
  "oldPermission": "view",
  "newPermission": "edit",
  "changedAt": "2025-11-19T10:30:00Z",
  "reason": "User requested edit access"
}
```

---

### 3.10 Add Toast Notifications for Real-time Updates

**Purpose**: Notify users when collaborators make changes.

**Implementation**:
```typescript
// src/hooks/useCollaboratorNotifications.tsx
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useCollaboratorNotifications(folder: FolderNode) {
  const { toast } = useToast();

  useEffect(() => {
    // Watch for changes to permissions list
    const prevLength = folder.permissions?.length || 0;

    const checkForChanges = () => {
      const newLength = folder.permissions?.length || 0;
      if (newLength > prevLength) {
        const newMember = folder.permissions[newLength - 1];
        toast({
          title: 'New collaborator',
          description: `${newMember.accountId} was added to this folder`,
        });
      }
    };

    const interval = setInterval(checkForChanges, 2000);
    return () => clearInterval(interval);
  }, [folder, toast]);
}
```

---

### 3.11 Add Breadcrumb Navigation for Shared Folders

**Purpose**: Help users understand folder hierarchy context.

**Enhancement**: Show full path in invite preview:
```
Home > Grocery Stores > Wegmans > Weekly List
                                    ^^^^^^^^^^^^
                                    Invited to this folder
```

---

### 3.12 Add "Copy Invite Link" Shortcut

**Enhancement**: Add quick action to context menu for recently generated invites.

**UI**:
- Context menu: "Copy Recent Invite Link" (only shows if invite was generated in last 24h)
- Tooltip: "Invite link expires in 6 days"

---

### 3.13 Add Invite Preview Email Template

**Purpose**: Generate pre-filled email body for manual sending.

**Enhancement**: When clicking "Send via Email", open mailto: with:
```
Subject: [BubbleList] {{owner}} invited you to collaborate on "{{folderName}}"

Body:
Hi!

{{owner}} has invited you to collaborate on their BubbleList folder "{{folderName}}".

Click here to accept: {{shareUrl}}

You'll have {{permission}} access to this folder.

This invite expires on {{expiresAt}}.

---
Sent from BubbleList
```

---

### 3.14 Add Permission Presets

**Enhancement**: Quick permission templates for common scenarios.

**UI**: Dropdown with presets:
- "Family Member" → Edit access, never expires
- "Friend" → View access, 30 days
- "Temporary" → View access, 7 days
- "Custom" → Manual configuration

---

### 3.15 Add Metrics Dashboard (Future)

**Purpose**: Track sharing usage for product insights.

**Metrics**:
- Total invites sent
- Acceptance rate
- Average time to acceptance
- Most shared folders
- Collaboration activity (edits per shared folder)

---

## 4. Prioritized Action Items

### Must Fix Before Implementation (Critical)

1. ✅ **[CRITICAL]** Decide on Jazz group management strategy (Gap 1.1)
   - **Recommendation**: Use hybrid approach (backend validates, frontend updates Jazz)
   - **Effort**: 1 day design + 2 days implementation
   - **Blocker**: All invite acceptance logic depends on this

2. ✅ **[CRITICAL]** Add routing infrastructure (Gap 1.2)
   - **Recommendation**: Add React Router for /invite/:token route
   - **Effort**: 0.5 days
   - **Blocker**: Phase 5 cannot start without this

3. ✅ **[CRITICAL]** Implement folder ownership tracking (Gap 1.9)
   - **Recommendation**: Add folder_ownership table + registration endpoint
   - **Effort**: 1 day
   - **Blocker**: All authorization checks depend on this

4. ✅ **[HIGH]** Add authentication middleware (Gap 1.8)
   - **Effort**: 0.5 days
   - **Blocker**: All endpoints need auth

5. ✅ **[HIGH]** Define correct Jazz group schema syntax (Gap 1.6)
   - **Effort**: 0.5 days
   - **Blocker**: Phase 2 cannot start without this

### Should Fix During Implementation (High Priority)

6. ✅ Add Kysely integration for type-safe queries (Gap 1.5)
7. ✅ Add rate limiting middleware (Gap 1.4)
8. ✅ Create database migration scripts (Refinement 3.4)
9. ✅ Add comprehensive TypeScript types (Refinement 3.3)
10. ✅ Standardize error response format (Inconsistency 2.6)

### Nice to Have (Medium Priority)

11. Add email validation utilities (Refinement 3.2)
12. Add security headers middleware (Refinement 3.6)
13. Add multi-user test setup (Gap 1.10)
14. Add invite cleanup job (Refinement 3.7)
15. Add toast notifications (Refinement 3.10)

### Future Enhancements (Low Priority)

16. Add permission presets (Refinement 3.14)
17. Add metrics dashboard (Refinement 3.15)
18. Add breadcrumb navigation (Refinement 3.11)

---

## 5. Updated Sprint Breakdown

### Pre-Sprint: Architecture Resolution (2 days)

**Day -2 to -1**:
- Implement routing infrastructure (React Router)
- Implement folder ownership tracking
- Implement authentication middleware
- Define Jazz group schema
- Create database migration scripts
- Set up Kysely integration

### Phase 1: Backend Foundation (4 days → 5 days)

**Changes**:
- Add 1 day for implementing hybrid Jazz group management
- Add folder ownership registration endpoint
- Implement authentication middleware across all endpoints

### Phase 2: Jazz Schema Extension (2 days → 3 days)

**Changes**:
- Add 1 day for testing Jazz group creation client-side
- Add 0.5 day for documenting Jazz/backend integration pattern

### Phase 3-7: No major changes

**Total Updated Timeline**: 2 (pre-sprint) + 5 + 3 + 1 + 2 + 2 + 2 + 1 = **18 days**

---

## 6. Risk Assessment

### High Risk Items

1. **Jazz Group Management Complexity**
   - **Risk**: Backend-to-Jazz integration is unproven
   - **Mitigation**: Prototype hybrid approach before sprint starts
   - **Contingency**: Fall back to client-only management (no server-side validation)

2. **Real-time Sync Reliability**
   - **Risk**: Jazz sync delays cause UX issues
   - **Mitigation**: Add optimistic updates + rollback logic
   - **Contingency**: Add manual refresh button

3. **Multi-user Testing**
   - **Risk**: Cannot adequately test sharing flows
   - **Mitigation**: Set up Playwright multi-context testing early
   - **Contingency**: Manual testing with multiple browsers

### Medium Risk Items

4. **Email Validation Bypass**
   - **Risk**: Users might accept invites with wrong account
   - **Mitigation**: Strict server-side email matching
   - **Monitoring**: Alert on email mismatch attempts

5. **Token Guessing Attacks**
   - **Risk**: Brute force token guessing
   - **Mitigation**: 256-bit tokens + rate limiting
   - **Monitoring**: Track failed validation attempts

---

## 7. Recommendations Summary

### Immediate Actions (Before Sprint Starts)

1. **Revise FOLDER_SHARING_SPRINT.md** to address all critical gaps
2. **Prototype** Jazz group management hybrid approach
3. **Set up** routing infrastructure (React Router)
4. **Create** folder ownership tracking system
5. **Define** authentication middleware pattern
6. **Write** database migration scripts
7. **Estimate** revised timeline (18-20 days vs. 14 days)

### During Sprint

1. **Daily standup**: Review progress against updated plan
2. **Code reviews**: Enforce type safety and error handling patterns
3. **Testing**: Set up multi-user test environment early (Day 3-4)
4. **Documentation**: Update as implementation reveals new patterns

### Post-Sprint

1. **Retrospective**: Identify what worked, what didn't
2. **Documentation**: Final update to FOLDER_SHARING_SPRINT.md with actual implementation notes
3. **Performance audit**: Test with 100+ collaborators
4. **Security audit**: Third-party review of token generation and validation

---

## 8. Conclusion

The FOLDER_SHARING_SPRINT.md document is a comprehensive specification, but requires significant revision to align with the actual codebase architecture. The most critical gap is the Jazz group management strategy, which affects the entire invite acceptance flow.

**Key Takeaways**:
1. **10 critical gaps** must be addressed before implementation
2. **8 inconsistencies** should be standardized
3. **15 refinements** would improve quality and maintainability
4. **Timeline extension** from 14 to 18-20 days is necessary
5. **Hybrid approach** for Jazz/backend integration is recommended

**Overall**: The feature is well-designed, but the implementation plan needs updates to match the codebase's actual patterns and constraints.

---

**Next Steps**:
1. Review this document with team
2. Decide on Jazz group management approach
3. Update FOLDER_SHARING_SPRINT.md
4. Create pre-sprint tasks for architectural setup
5. Revise timeline and success criteria
6. Begin implementation with updated plan

---

**Document Version**: 1.0
**Review Date**: 2025-11-19
**Reviewer**: Claude Code (AI Assistant)
**Status**: Ready for Team Review

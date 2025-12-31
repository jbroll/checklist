# Public Demo Mode Implementation Plan

This document outlines the implementation plan for adding public/demo mode to CheckList, allowing template owners to share read-only templates with public, writeable sessions.

## Overview

**Goal**: Allow users to share templates publicly where:
- Anyone (including anonymous users) can view the template structure
- Anyone can interact with sessions (select items, check them off)
- Only the owner can modify the template itself (add/remove/edit items)
- Multiple anonymous users can collaborate on the same session in real-time

## Architecture

### Current State

```
FolderNode (owned by Group)
├── name, items[], etc. (template data)
└── sessions[] (plain JSON array embedded in FolderNode)
```

**Problem**: Sessions are embedded JSON, not separate CoValues. Write access to sessions = write access to entire template.

### Target State

```
FolderNode (owned by private Group - read-only for public)
├── name, items[], etc. (template data)
├── isPublic: boolean
├── publicSlug: string (URL-friendly identifier)
└── publicSessions: co.list(PublicSession) (owned by public Group)

PublicSession (owned by public Group - writeable by everyone)
├── templateId: string (reference to parent template)
├── itemStates: Record<string, ItemState>
├── categoryExpanded: Record<string, boolean>
└── ... (session metadata)
```

## Implementation Phases

### Phase 1: Schema Changes

#### 1.1 Create PublicSession CoValue

Create a new CoValue for public sessions that can be owned by a different Group than the template.

**File**: `src/schemas/public.ts`

```typescript
import { co, z } from 'jazz-tools';

/**
 * PublicSession - Session state for public/demo templates
 *
 * Owned by a public Group with everyone: "writer" permission,
 * allowing anonymous users to interact with sessions.
 */
export const PublicSession = co.map({
  // Reference to the parent template (FolderNode ID)
  templateId: z.string(),

  // Session display name (auto-generated from timestamp)
  name: z.optional(z.string()),

  // Item states - maps itemId to selection/check state
  itemStates: z.record(
    z.string(),
    z.object({
      selected: z.boolean(),
      checked: z.boolean(),
      selectedAt: z.optional(z.date()),
      checkedAt: z.optional(z.date()),
      notes: z.optional(z.string()),
    }),
  ),

  // UI state - which categories are expanded
  categoryExpanded: z.record(z.string(), z.boolean()),

  // View mode preference
  viewMode: z.enum(['zone-in-hierarchy', 'flat']),

  // Cached counts for performance
  selectedCount: z.number(),
  checkedCount: z.number(),
  remainingCount: z.number(),

  // Soft delete
  archived: z.boolean(),

  // Timestamps
  createdAt: z.date(),
  lastActivityAt: z.date(),
});

/**
 * PublicSessionList - List of public sessions for a template
 */
export const PublicSessionList = co.list(PublicSession);
```

#### 1.2 Extend FolderNode Schema

Add public access fields to `FolderNode`.

**File**: `src/schemas/tree.ts` (modifications)

```typescript
// Add to FolderNode schema:

// Public access fields
isPublic: z.optional(z.boolean()),

// URL-friendly slug for public access (e.g., "weekly-groceries")
publicSlug: z.optional(z.string()),

// Public sessions (separate from private sessions)
// Owned by a public Group with everyone: "writer"
get publicSessions() {
  return co.optional(PublicSessionList);
},

// The public Group that owns publicSessions
// This Group has everyone: "writer" permission
get publicSessionsGroup() {
  return co.optional(Group);
},
```

#### 1.3 Create PublicTemplateRegistry

A global registry mapping public slugs to template IDs for URL resolution.

**File**: `src/schemas/public.ts` (addition)

```typescript
/**
 * PublicTemplateEntry - Entry in the public template registry
 */
export const PublicTemplateEntry = co.map({
  slug: z.string(),
  templateId: z.string(),  // FolderNode CoValue ID
  ownerAccountId: z.string(),
  title: z.string(),
  description: z.optional(z.string()),
  createdAt: z.date(),
  // Stats for discovery/featured templates
  viewCount: z.optional(z.number()),
  sessionCount: z.optional(z.number()),
});
```

### Phase 2: Guest Authentication

#### 2.1 Jazz Anonymous Auth Setup

Configure Jazz to support anonymous/guest accounts.

**File**: `src/lib/jazz.tsx` (modifications)

```typescript
import { AnonymousJazzAuth } from 'jazz-tools/auth/anonymous';

// Add anonymous auth provider for public routes
export function useGuestAuth() {
  return useJazzAuth({
    auth: AnonymousJazzAuth,
    // Guest accounts are ephemeral - stored in sessionStorage
    storage: 'session',
  });
}
```

#### 2.2 Auth Context Extension

Extend auth context to handle both authenticated and guest users.

**File**: `src/lib/auth-context.tsx` (new file)

```typescript
type AuthMode = 'authenticated' | 'guest' | 'loading';

interface AuthContextValue {
  mode: AuthMode;
  account: Account | GuestAccount | null;
  isGuest: boolean;
  canEditTemplates: boolean;
  signIn: () => void;
  signOut: () => void;
}
```

### Phase 3: Public URL Routing

#### 3.1 Route Structure

```
/public/:slug              - View public template (landing)
/public/:slug/session      - Active session view (auto-creates or continues)
/public/:slug/session/:id  - Specific session
```

#### 3.2 Public Template Page

**File**: `src/components/public/PublicTemplatePage.tsx`

```typescript
interface PublicTemplatePageProps {
  slug: string;
}

export function PublicTemplatePage({ slug }: PublicTemplatePageProps) {
  // 1. Resolve slug to template ID via registry or backend
  // 2. Load template as read-only
  // 3. Load or create public session
  // 4. Render session view with read-only template
}
```

#### 3.3 URL Resolution

Two options for slug-to-template resolution:

**Option A: Backend API** (Recommended for SEO/security)
```
GET /api/public/templates/:slug
Returns: { templateId, title, description, ownerName }
```

**Option B: Jazz CoValue Registry**
- Global `PublicTemplateRegistry` CoValue
- Requires careful access control

### Phase 4: Making Templates Public

#### 4.1 PublishDialog Component

**File**: `src/components/sharing/PublishDialog.tsx`

```typescript
interface PublishDialogProps {
  folder: FolderNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishDialog({ folder, open, onOpenChange }: PublishDialogProps) {
  // UI for:
  // 1. Toggle public/private
  // 2. Set/edit public slug
  // 3. Preview public URL
  // 4. Copy share link
  // 5. View public session stats
}
```

#### 4.2 Publish Service

**File**: `src/services/publishService.ts`

```typescript
/**
 * Make a template publicly accessible
 */
export async function publishTemplate(
  folder: FolderNode,
  slug: string,
  account: Account,
): Promise<{ publicUrl: string }> {
  // 1. Validate slug (unique, URL-safe)
  // 2. Create public Group with everyone: "writer"
  // 3. Create publicSessions list owned by public Group
  // 4. Set isPublic, publicSlug on folder
  // 5. Register in backend/registry
  // 6. Return public URL
}

/**
 * Unpublish a template
 */
export async function unpublishTemplate(
  folder: FolderNode,
  account: Account,
): Promise<void> {
  // 1. Set isPublic = false
  // 2. Optionally archive public sessions
  // 3. Remove from registry
}
```

### Phase 5: Backend Support

#### 5.1 Public Template API

**File**: `backend/src/public.ts`

```typescript
// GET /api/public/templates/:slug
// Resolve slug to template metadata (no auth required)
router.get('/templates/:slug', async (req, res) => {
  const { slug } = req.params;
  // Look up in database or Jazz registry
  // Return template metadata (not full content)
});

// POST /api/public/templates
// Register a new public template (auth required)
router.post('/templates', requireAuth, async (req, res) => {
  const { folderId, slug, title, description } = req.body;
  // Validate ownership
  // Check slug availability
  // Create registry entry
});

// DELETE /api/public/templates/:slug
// Unpublish a template (auth required)
router.delete('/templates/:slug', requireAuth, async (req, res) => {
  // Validate ownership
  // Remove registry entry
});
```

#### 5.2 Database Schema

**File**: `backend/src/db.ts` (additions)

```sql
CREATE TABLE public_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  folder_covalue_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  view_count INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_public_templates_slug ON public_templates(slug);
CREATE INDEX idx_public_templates_owner ON public_templates(owner_user_id);
```

### Phase 6: Public Session UI

#### 6.1 Read-Only Template Display

Modify existing components to support read-only mode:

**File**: `src/components/session/SessionView.tsx` (modifications)

```typescript
interface SessionViewProps {
  // ... existing props
  readOnly?: boolean;  // Template is read-only (public mode)
}

// In render:
// - Hide "Add Item" button when readOnly
// - Hide item edit/delete actions when readOnly
// - Keep select/check interactions enabled
```

#### 6.2 Public Session Header

**File**: `src/components/public/PublicSessionHeader.tsx`

```typescript
export function PublicSessionHeader({ template, session }: Props) {
  return (
    <header>
      {/* Template name */}
      {/* "Sign in to create your own lists" CTA */}
      {/* Share button */}
      {/* Session selector (if multiple) */}
    </header>
  );
}
```

#### 6.3 Guest Prompt Component

**File**: `src/components/public/GuestPrompt.tsx`

```typescript
export function GuestPrompt() {
  return (
    <div className="guest-prompt">
      <p>You're using CheckList as a guest.</p>
      <p>Sign in to:</p>
      <ul>
        <li>Create your own lists</li>
        <li>Save your progress</li>
        <li>Access from any device</li>
      </ul>
      <Button onClick={signIn}>Sign In</Button>
    </div>
  );
}
```

### Phase 7: Migration

#### 7.1 Existing Sessions Migration

For templates that become public, existing private sessions stay private. Only new sessions created through the public URL use the public sessions system.

#### 7.2 Data Model Compatibility

The new `publicSessions` field is optional, so existing templates continue to work unchanged. Public functionality is additive.

## Security Considerations

### Access Control Matrix

| Actor | Template (items) | Private Sessions | Public Sessions |
|-------|------------------|------------------|-----------------|
| Owner | Read/Write | Read/Write | Read/Write |
| Collaborator | Read/Write | Read/Write | Read/Write |
| Guest (public) | Read | No Access | Read/Write |
| Anonymous | Read | No Access | Read/Write |

### Rate Limiting

```typescript
// Public endpoints rate limits
const publicRateLimits = {
  templateView: '100/minute/IP',
  sessionCreate: '10/minute/IP',
  sessionUpdate: '60/minute/IP',
};
```

### Slug Validation

```typescript
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const RESERVED_SLUGS = ['api', 'admin', 'public', 'invite', 'auth', 'help'];
const MAX_SLUG_LENGTH = 64;
const MIN_SLUG_LENGTH = 3;
```

### Abuse Prevention

1. **Session limits**: Max 100 active public sessions per template
2. **Auto-cleanup**: Archive public sessions after 24 hours of inactivity
3. **Report mechanism**: Allow flagging inappropriate content
4. **Owner controls**: Ability to disable public sessions temporarily

## File Changes Summary

### New Files

```
src/schemas/public.ts              - PublicSession, PublicTemplateEntry schemas
src/lib/guest-auth.tsx             - Guest authentication setup
src/services/publishService.ts     - Publish/unpublish logic
src/components/public/
  PublicTemplatePage.tsx           - Main public template view
  PublicSessionHeader.tsx          - Header for public sessions
  GuestPrompt.tsx                  - Sign-in prompt for guests
src/components/sharing/
  PublishDialog.tsx                - UI for making templates public
backend/src/public.ts              - Public template API endpoints
```

### Modified Files

```
src/schemas/tree.ts                - Add public fields to FolderNode
src/schemas/index.ts               - Export new schemas
src/lib/jazz.tsx                   - Add guest auth support
src/App.tsx                        - Add public routes
src/components/session/SessionView.tsx - Add readOnly mode
src/components/tree/FolderNodeView.tsx - Add publish option to menu
backend/src/index.ts               - Mount public routes
backend/src/db.ts                  - Add public_templates table
```

## Testing Strategy

### Unit Tests

```typescript
// src/services/publishService.test.ts
describe('publishService', () => {
  it('creates public Group with everyone writer permission');
  it('validates slug uniqueness');
  it('validates slug format');
  it('rejects reserved slugs');
  it('sets isPublic and publicSlug on folder');
});
```

### E2E Tests

```typescript
// e2e/public-templates.spec.ts
describe('Public Templates', () => {
  it('owner can publish a template');
  it('anonymous user can view public template');
  it('anonymous user can interact with public session');
  it('anonymous user cannot edit template items');
  it('owner can unpublish template');
  it('unpublished template returns 404');
});
```

### Manual Testing Checklist

- [ ] Publish template with custom slug
- [ ] Access public URL in incognito window
- [ ] Select items in public session
- [ ] Check off items in public session
- [ ] Verify changes sync in real-time between multiple browsers
- [ ] Verify template items cannot be modified by guest
- [ ] Unpublish template and verify 404
- [ ] Sign in from guest session preserves current session

## Implementation Order

1. **Schema changes** (Phase 1) - Foundation
2. **Backend API** (Phase 5) - Slug resolution
3. **Publish service** (Phase 4) - Make templates public
4. **Guest auth** (Phase 2) - Anonymous access
5. **Public routing** (Phase 3) - URL handling
6. **Public UI** (Phase 6) - User experience
7. **Migration** (Phase 7) - Existing data

## Estimated Effort

| Phase | Complexity | Dependencies |
|-------|------------|--------------|
| Phase 1: Schema | Medium | None |
| Phase 2: Guest Auth | Medium | Jazz docs research |
| Phase 3: Routing | Low | Phase 1 |
| Phase 4: Publishing | Medium | Phase 1, 5 |
| Phase 5: Backend | Medium | Phase 1 |
| Phase 6: Public UI | Medium | Phase 1-5 |
| Phase 7: Migration | Low | Phase 1 |

## Open Questions

1. **Session persistence for guests**: Should guest sessions persist across browser restarts? (Current plan: sessionStorage, ephemeral)

2. **Multiple simultaneous sessions**: Should public templates support multiple concurrent sessions, or one shared session per template?

3. **Guest-to-user conversion**: When a guest signs in, should their session work transfer to their account?

4. **Template discovery**: Should there be a public gallery of published templates, or only direct links?

5. **Analytics**: What metrics should we track for public templates? (views, sessions created, completion rates)

## References

- [Jazz Groups Documentation](https://jazz.tools/docs/permissions-and-sharing/overview)
- [Jazz Anonymous Auth](https://jazz.tools/docs/react/key-features/authentication/)
- Current sharing implementation: `src/components/sharing/ShareDialog.tsx`
- Current folder service: `src/services/folderService.ts`

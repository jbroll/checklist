# Code Review Remediation Plan (ARCHIVED)

> **Status: COMPLETE** - Archived 2026-04-02. All critical and high priority items resolved.
> Security items verified via implementation in `@jbr-jazz/hierarchy-backend` shared package.
> Remaining item (TreeView 610 lines) deferred to Roadmap as low-priority refactoring.

This document outlines the remediation plan for issues identified in the comprehensive code review conducted on 2024-12-30.

## Executive Summary

- **Critical Issues**: 2 - RESOLVED
- **High Priority**: 5 - RESOLVED
- **Medium Priority**: 7 - RESOLVED (5 done, 1 by-design, 1 deferred to Roadmap)
- **Test Coverage Gaps**: 5 - RESOLVED (1528 tests across 64 files)

---

## Phase 1: Critical Security Fixes

### 1.1 Add Authorization Checks to Share Endpoints

**Location**: `backend/src/shares.ts:147-174, 207-249`

**Problem**: Any authenticated user can enumerate invites and collaborators for any folder by guessing folder IDs.

**Fix**:
```typescript
// Before processing invite/collaborator requests, verify ownership
async function verifyFolderOwnership(userId: string, folderId: string, db: Database): Promise<boolean> {
  const folder = await db.get(
    'SELECT owner_id FROM folder_shares WHERE folder_id = ? AND owner_id = ?',
    [folderId, userId]
  );
  return !!folder;
}

// Apply to GET /api/shares/folders/:folderId/invites
// Apply to GET /api/shares/folders/:folderId/collaborators
// Apply to DELETE /api/shares/folders/:folderId/collaborators/:oderId
```

**Files to Modify**:
- `backend/src/shares.ts`

**Acceptance Criteria**:
- [ ] Users can only view invites for folders they own
- [ ] Users can only view collaborators for folders they own or collaborate on
- [ ] Unauthorized requests return 403 Forbidden
- [ ] Add E2E tests for authorization checks

---

### 1.2 Fix Race Condition in Email Verification

**Location**: `backend/src/verified-emails.ts:142-159`

**Problem**: Concurrent verification requests could result in duplicate email verifications.

**Fix**:
```typescript
// Use database transaction with unique constraint
async function verifyEmail(userId: string, email: string, db: Database): Promise<void> {
  await db.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    // Check if already verified
    const existing = await db.get(
      'SELECT 1 FROM verified_emails WHERE user_id = ? AND email = ?',
      [userId, email]
    );
    if (existing) {
      await db.run('ROLLBACK');
      return; // Already verified, no-op
    }

    await db.run(
      'INSERT INTO verified_emails (user_id, email, verified_at) VALUES (?, ?, ?)',
      [userId, email, Date.now()]
    );
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}
```

**Files to Modify**:
- `backend/src/verified-emails.ts`

**Acceptance Criteria**:
- [ ] Concurrent verification requests don't create duplicates
- [ ] Database has unique constraint on (user_id, email)
- [ ] Add unit test for concurrent verification scenario

---

## Phase 2: High Priority Security Hardening

### 2.1 Reject Requests Without Origin Header

**Location**: `backend/src/index.ts:105-108`

**Problem**: CORS currently allows requests without an Origin header, which could be exploited.

**Fix**:
```typescript
// Update CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    // Reject requests without origin (except for same-origin requests in development)
    if (!origin) {
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Origin header required'));
      }
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
```

**Files to Modify**:
- `backend/src/index.ts`

**Acceptance Criteria**:
- [ ] Production rejects requests without Origin header
- [ ] Development allows localhost requests
- [ ] Add test for CORS rejection

---

### 2.2 Remove `unsafe-inline` from CSP

**Location**: `backend/src/index.ts:66-67`

**Problem**: `unsafe-inline` in Content Security Policy significantly reduces XSS protection.

**Fix**:
```typescript
// Option A: Use nonces for inline scripts
import { randomBytes } from 'crypto';

app.use((req, res, next) => {
  const nonce = randomBytes(16).toString('base64');
  res.locals.nonce = nonce;

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'", // Keep for Tailwind
    "img-src 'self' data: https:",
    "connect-src 'self' wss://cloud.jazz.tools https://api.stripe.com",
  ].join('; '));

  next();
});

// Option B: If inline scripts aren't needed, remove unsafe-inline entirely
```

**Files to Modify**:
- `backend/src/index.ts`
- Potentially frontend build config if inline scripts exist

**Acceptance Criteria**:
- [ ] CSP no longer includes `unsafe-inline` for scripts
- [ ] Application functions correctly with new CSP
- [ ] Test that XSS payloads are blocked

---

### 2.3 Fix Memory Leak in Rate Limiter

**Location**: `backend/src/lib/rate-limiter.ts`

**Problem**: Expired rate limit entries are never cleaned up, causing memory growth over time.

**Fix**:
```typescript
class RateLimiter {
  private store: Map<string, { count: number; resetAt: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private windowMs: number, private maxRequests: number) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }

  // ... rest of implementation
}
```

**Files to Modify**:
- `backend/src/lib/rate-limiter.ts`

**Acceptance Criteria**:
- [ ] Expired entries are cleaned up periodically
- [ ] Memory usage stays stable under load
- [ ] Add unit test for cleanup behavior

---

### 2.4 Add Input Validation to Share Endpoints

**Location**: `backend/src/shares.ts:20, 32-47`

**Problem**: Request bodies are not validated, risking injection or malformed data.

**Fix**:
```typescript
import { z } from 'zod';

const createInviteSchema = z.object({
  recipientEmail: z.string().email().max(255),
  permission: z.enum(['view', 'edit', 'admin']),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

// Validation middleware
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'validation_error',
        details: result.error.flatten(),
      });
    }
    req.body = result.data;
    next();
  };
}

// Apply to routes
app.post('/api/shares/folders/:folderId/invites',
  validateBody(createInviteSchema),
  createInviteHandler
);
```

**Files to Modify**:
- `backend/src/shares.ts`
- Create `backend/src/lib/validation.ts` for reusable middleware

**Acceptance Criteria**:
- [ ] All share endpoints validate request bodies
- [ ] Invalid requests return 400 with details
- [ ] Add tests for validation edge cases

---

### 2.5 Remove Email from Error Responses

**Location**: `backend/src/shares.ts:101-106`

**Problem**: Error responses leak email addresses, enabling enumeration attacks.

**Fix**:
```typescript
// Before
if (existingInvite) {
  return res.status(400).json({
    error: 'invite_exists',
    message: `An invite already exists for ${email}` // Leaks email
  });
}

// After
if (existingInvite) {
  return res.status(400).json({
    error: 'invite_exists',
    message: 'An invite already exists for this email address'
  });
}
```

**Files to Modify**:
- `backend/src/shares.ts`
- `backend/src/verified-emails.ts` (audit for similar issues)

**Acceptance Criteria**:
- [ ] No PII in error responses
- [ ] Error messages are user-friendly but generic
- [ ] Audit all endpoints for information leakage

---

## Phase 3: Code Quality Improvements

### 3.1 Create Typed Jazz Wrapper Hooks

**Problem**: 50+ `as any` casts throughout codebase due to Jazz TypeScript inference issues.

**Solution**: Create wrapper hooks that properly handle `MaybeLoaded` types.

**Implementation**:
```typescript
// src/lib/jazz-hooks.ts
import { useAccount as useJazzAccount } from 'jazz-react';
import type { Account } from '@/schemas';

/**
 * Type-safe account hook that handles MaybeLoaded states
 */
export function useTypedAccount(): {
  account: Account | null;
  loading: boolean;
} {
  const rawAccount = useJazzAccount<typeof Account>();

  if (!rawAccount) {
    return { account: null, loading: true };
  }

  if ('$jazz' in rawAccount && rawAccount.$jazz?.loading) {
    return { account: null, loading: true };
  }

  return { account: rawAccount as Account, loading: false };
}

/**
 * Type-safe CoValue hook
 */
export function useTypedCoValue<T>(
  coValue: T | undefined | null
): { value: T | null; loading: boolean } {
  if (!coValue) {
    return { value: null, loading: true };
  }

  // Handle MaybeLoaded
  if (typeof coValue === 'object' && '$jazz' in coValue) {
    const jazz = (coValue as any).$jazz;
    if (jazz?.loading) {
      return { value: null, loading: true };
    }
  }

  return { value: coValue, loading: false };
}
```

**Files to Create**:
- `src/lib/jazz-hooks.ts`

**Files to Modify**:
- `src/components/editor/AppContainer.tsx`
- `src/components/session/SessionView.tsx`
- `src/components/tree/TreeView.tsx`
- All components using `useAccount` or CoValues

**Acceptance Criteria**:
- [ ] New hooks handle all loading states
- [ ] Remove all `as any` casts related to Jazz types
- [ ] TypeScript compiles without Jazz-related errors
- [ ] Add unit tests for hook edge cases

---

### 3.2 Split Large Components

**Problem**: `AppContainer.tsx` (385 lines) and `TreeView.tsx` (611 lines) violate single responsibility.

**Solution**: Extract logic into custom hooks and split into focused components.

#### AppContainer Refactor

```
src/components/editor/
├── AppContainer.tsx (orchestration only, ~100 lines)
├── hooks/
│   ├── useAppNavigation.ts (navigation logic)
│   ├── useSessionManagement.ts (session CRUD)
│   └── useKeyboardShortcuts.ts (keyboard handlers)
├── AppHeader.tsx (header UI)
├── AppSidebar.tsx (sidebar/tree container)
└── AppContent.tsx (main content area)
```

#### TreeView Refactor

```
src/components/tree/
├── TreeView.tsx (tree rendering only, ~150 lines)
├── hooks/
│   ├── useTreeState.ts (expand/collapse state)
│   ├── useTreeDragDrop.ts (drag and drop logic)
│   └── useTreeActions.ts (CRUD operations)
├── TreeNode.tsx (single node rendering)
├── TreeToolbar.tsx (toolbar actions)
└── TrashSection.tsx (archived items)
```

**Acceptance Criteria**:
- [ ] No component exceeds 200 lines
- [ ] Each component has single responsibility
- [ ] Logic extracted to testable hooks
- [ ] Existing functionality preserved
- [ ] Add tests for extracted hooks

---

### 3.3 Replace `window.confirm` with App Dialog

**Location**: `src/components/tree/TreeView.tsx:399-407`

**Problem**: Using `window.confirm` breaks UX consistency and accessibility.

**Fix**:
```typescript
// Use the existing dialog context
import { useDialog } from '@/lib/dialog-context';

const { showConfirmDialog } = useDialog();

const handleEmptyTrash = useCallback(async () => {
  const count = getArchivedCount();

  const confirmed = await showConfirmDialog({
    title: 'Empty Trash',
    message: `Permanently delete ${count} archived item${count === 1 ? '' : 's'}?`,
    confirmLabel: 'Delete',
    confirmVariant: 'destructive',
  });

  if (confirmed) {
    await emptyTrash();
  }
}, [account, showConfirmDialog]);
```

**Files to Modify**:
- `src/components/tree/TreeView.tsx`
- Audit codebase for other `window.confirm` / `window.alert` usage

**Acceptance Criteria**:
- [ ] No `window.confirm` or `window.alert` in codebase
- [ ] All confirmations use app dialog system
- [ ] Dialogs are accessible (keyboard navigation, ARIA)

---

### 3.4 Add Error Boundaries to Key Routes

**Problem**: Only root `App.tsx` has error boundary. Component crashes take down entire app.

**Solution**: Add granular error boundaries around major features.

**Implementation**:
```typescript
// src/components/ui/FeatureErrorBoundary.tsx
import { Component, ReactNode } from 'react';

interface Props {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in ${this.props.feature}:`, error, errorInfo);
    // Report to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 text-center">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground">
            The {this.props.feature} encountered an error.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-primary underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Apply to**:
- `SessionView` - Shopping session
- `TreeView` - Folder navigation
- `ImportDialog` - Data import
- `ShareDialog` - Sharing features

**Acceptance Criteria**:
- [ ] Each major feature has its own error boundary
- [ ] Errors in one feature don't crash others
- [ ] Error UI is user-friendly with recovery option
- [ ] Errors are logged for debugging

---

### 3.5 Define Service Interfaces

**Problem**: Services are concrete implementations without interfaces, hindering testability.

**Solution**: Define interfaces and use dependency injection via React context.

**Implementation**:
```typescript
// src/services/interfaces.ts
export interface ISessionService {
  createSession(account: Account, templateId: string): string;
  getSession(account: Account, templateId: string, sessionId: string): SessionData | null;
  updateItemState(account: Account, templateId: string, sessionId: string, itemId: string, state: Partial<ItemState>): void;
  archiveSession(account: Account, templateId: string, sessionId: string): void;
}

export interface IFolderService {
  createFolder(account: Account, name: string, parentPath?: string): FolderNode;
  renameFolder(account: Account, folderId: string, newName: string): void;
  moveFolder(account: Account, folderId: string, newParentPath: string): void;
  archiveFolder(account: Account, folderId: string): void;
}

// src/services/context.tsx
import { createContext, useContext, ReactNode } from 'react';

interface ServiceContext {
  sessionService: ISessionService;
  folderService: IFolderService;
  templateService: ITemplateService;
}

const ServicesContext = createContext<ServiceContext | null>(null);

export function ServicesProvider({ children, services }: {
  children: ReactNode;
  services: ServiceContext;
}) {
  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): ServiceContext {
  const context = useContext(ServicesContext);
  if (!context) throw new Error('useServices must be used within ServicesProvider');
  return context;
}
```

**Benefits**:
- Easy to mock services in tests
- Swap implementations without changing consumers
- Clear contracts between layers

**Acceptance Criteria**:
- [ ] Interfaces defined for all services
- [ ] Services injected via context
- [ ] Components use `useServices()` hook
- [ ] Tests use mock implementations

---

## Phase 4: Test Coverage Improvements

### 4.1 Test `useItemInteraction` Hook

**Location**: `src/lib/useItemInteraction.ts`

**Priority**: Critical - Complex state machine for drag/edit interactions

**Test Scenarios**:
```typescript
describe('useItemInteraction', () => {
  describe('tap interactions', () => {
    it('should call onSelect on quick tap');
    it('should not select during drag');
    it('should cancel selection if pointer moves');
  });

  describe('long press', () => {
    it('should enter edit mode after 500ms hold');
    it('should cancel long press on movement');
    it('should show visual feedback during hold');
  });

  describe('drag and drop', () => {
    it('should start drag after movement threshold');
    it('should call onDragStart with item data');
    it('should call onDragEnd on pointer up');
    it('should handle drag cancel on escape key');
  });

  describe('edit mode', () => {
    it('should enable text editing');
    it('should save on blur');
    it('should cancel on escape');
    it('should handle empty input');
  });
});
```

**Acceptance Criteria**:
- [ ] 90%+ coverage for useItemInteraction
- [ ] All state transitions tested
- [ ] Edge cases covered (rapid clicks, interrupted drags)

---

### 4.2 Test `SessionView` Component

**Location**: `src/components/session/SessionView.tsx`

**Priority**: Critical - Main user interface

**Test Scenarios**:
```typescript
describe('SessionView', () => {
  describe('rendering', () => {
    it('should render session with items');
    it('should show empty state when no items');
    it('should display correct zone partitioning');
  });

  describe('item interactions', () => {
    it('should toggle item selection on tap');
    it('should move item to checked zone on check');
    it('should support batch selection');
  });

  describe('zones', () => {
    it('should render Available zone with unselected items');
    it('should render Selected zone with selected items');
    it('should render Checked zone with checked items');
    it('should allow drag between zones');
  });

  describe('view modes', () => {
    it('should switch between flat and hierarchical views');
    it('should persist view mode preference');
  });

  describe('edit mode', () => {
    it('should enter edit mode on toggle');
    it('should allow item reordering in edit mode');
    it('should exit edit mode on back navigation');
  });
});
```

**Acceptance Criteria**:
- [ ] 80%+ coverage for SessionView
- [ ] All user flows tested
- [ ] Accessibility tested (keyboard navigation)

---

### 4.3 Test Import/Export Components

**Locations**:
- `src/components/import/ImportDialog.tsx`
- `src/components/export/ExportDialog.tsx`

**Priority**: High - Data portability features

**Test Scenarios**:
```typescript
describe('ImportDialog', () => {
  it('should accept valid JSON file');
  it('should accept valid CSV file');
  it('should accept valid TXT file');
  it('should reject invalid file format');
  it('should reject oversized files');
  it('should show import preview');
  it('should handle import errors gracefully');
  it('should report import results');
});

describe('ExportDialog', () => {
  it('should export to JSON format');
  it('should export to CSV format');
  it('should export to TXT format');
  it('should include all selected data');
  it('should handle empty data gracefully');
});
```

**Acceptance Criteria**:
- [ ] 80%+ coverage for import/export components
- [ ] All file formats tested
- [ ] Error scenarios covered

---

### 4.4 Test Sharing Components

**Location**: `src/components/sharing/ShareDialog.tsx`

**Priority**: High - Collaboration feature

**Test Scenarios**:
```typescript
describe('ShareDialog', () => {
  it('should create invite with valid email');
  it('should validate email format');
  it('should show permission options');
  it('should display existing collaborators');
  it('should allow removing collaborators');
  it('should copy invite link to clipboard');
  it('should handle API errors');
});
```

**Acceptance Criteria**:
- [ ] 80%+ coverage for sharing components
- [ ] Permission levels tested
- [ ] Error states tested

---

### 4.5 Add E2E Error Handling Tests

**Location**: `e2e/error-handling.spec.ts`

**Test Scenarios**:
```typescript
test.describe('Error Handling', () => {
  test('should handle network disconnection');
  test('should handle invalid import file');
  test('should handle subscription limit exceeded');
  test('should handle OAuth failure');
  test('should recover from Jazz sync errors');
});
```

**Acceptance Criteria**:
- [ ] All error scenarios have E2E coverage
- [ ] Error recovery is tested
- [ ] User-facing error messages verified

---

## Implementation Status (as of 2026-04-02)

### Phase 1: Critical Security - COMPLETE
- [x] 1.1 Authorization checks on share endpoints (dual auth in @jbr-jazz/hierarchy-backend)
- [x] 1.2 Race condition fix in email verification (db.transaction() for atomicity)
- [x] 2.5 Remove email from error responses (no PII in any error messages)

### Phase 2: Security Hardening - COMPLETE
- [x] 2.1 CORS origin validation (allowedOrigins exact match, CSRF headers enforce protection)
- [x] 2.2 CSP unsafe-inline - scripts already blocked; style-src kept by design (Radix UI)
- [x] 2.3 Rate limiter memory leak fix (cleanup interval + destroy() in @jbr-jazz)
- [x] 2.4 Input validation middleware (Zod schemas on all share endpoints)

### Phase 3: Code Quality - MOSTLY COMPLETE
- [x] 3.1 Typed Jazz hooks (Jazz v0.19.x schema syntax improved inference)
- [x] 3.2 Split large components - AppContainer 285 lines (acceptable); TreeView 610 lines (deferred)
- [x] 3.3 Replace window.confirm (all use dialog context system)
- [x] 3.4 Add error boundaries (Root + FeatureErrorBoundary)
- [ ] 3.5 Service interfaces (optional, deferred)

### Phase 4: Testing - COMPLETE
- [x] 1528 tests across 64 test files
- [x] useItemInteraction, SessionView, import/export, sharing all tested
- [x] E2E test suite with smoke testing

### Remaining (deferred to Roadmap)
- TreeView.tsx refactoring (610 lines) - functional but large
- Service interfaces - low value given current architecture

---

## Final Metrics

| Metric | Original | Final |
|--------|----------|-------|
| Critical vulnerabilities | 2 | 0 |
| High priority issues | 5 | 0 |
| Test files | ~20 | 64 |
| Total tests | ~146 | 1528 |

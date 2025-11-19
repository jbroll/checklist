# Folder Sharing - Implementation Plan

**Version**: 1.0
**Date**: 2025-11-19
**Estimated Duration**: 18-20 days

---

## Phase 0: Pre-Sprint Setup (2 days)

### Day -2: Backend Infrastructure

**Tasks**:
1. Add dependencies to `backend/package.json`
   - `express-rate-limit` for rate limiting
   - `zod` for request validation
2. Create database migration script
3. Set up Kysely type-safe database client
4. Create Jazz agent authentication
5. Add environment variables

**Files Created**:
- `backend/src/migrations/001_sharing_tables.sql`
- `backend/src/database.ts`
- `backend/src/jazz-agent.ts`
- `backend/.env` (add `JAZZ_AGENT_SECRET`)

**Key Decisions**:
- Migration uses raw SQL for clarity
- Kysely provides type safety for queries
- Jazz agent initialized once at server startup

---

### Day -1: Middleware & Routing

**Tasks**:
1. Create authentication middleware
2. Create rate limiting middleware
3. Set up route handlers structure
4. Add validation utilities
5. Create error response helpers

**Files Created**:
- `backend/src/middleware/auth.ts`
- `backend/src/middleware/rateLimit.ts`
- `backend/src/utils/validation.ts`
- `backend/src/utils/errors.ts`
- `backend/src/routes/shares.ts`
- `backend/src/routes/folders.ts`

**Pattern Example** (authentication):
```typescript
// Middleware verifies BetterAuth session
// Attaches user with: id, email, phone, jazzAccountId, oauthSub
```

---

## Phase 1: Backend Foundation (5 days)

### Day 1: Core API Setup

**Tasks**:
1. Wire up routes in `backend/src/index.ts`
2. Implement folder ownership registration endpoint
3. Create audit logging service
4. Test database connections and migrations

**Files Modified**:
- `backend/src/index.ts` - Add routes
- `backend/src/routes/folders.ts` - Registration endpoint

**Files Created**:
- `backend/src/services/auditService.ts`

**Testing**: Manual API tests with Postman/curl

---

### Day 2: Invite Generation

**Tasks**:
1. Implement `POST /api/shares/invite` endpoint
2. Token generation utility
3. Identifier validation (email/phone detection)
4. Request validation with Zod schemas
5. Rate limiting on endpoint

**Files Modified**:
- `backend/src/routes/shares.ts`

**Files Created**:
- `backend/src/services/tokenService.ts`

**Key Logic**:
- Detect email vs phone by regex
- Normalize identifiers (lowercase email, trim)
- Generate 32-byte secure random tokens
- Store with expiration timestamps

---

### Day 3: Invite Validation

**Tasks**:
1. Implement `GET /api/shares/validate/:token` endpoint
2. Token validation logic (expiration, revocation checks)
3. Folder metadata retrieval
4. Error response formatting

**Files Modified**:
- `backend/src/routes/shares.ts`

**Logic Flow**:
- Query database for token
- Check not expired, accepted, or revoked
- Return invite details or error

---

### Day 4: Invite Acceptance (Backend)

**Tasks**:
1. Implement `POST /api/shares/accept` endpoint
2. Recipient identifier matching logic
3. Jazz account ID lookup from BetterAuth
4. OAuth `sub` storage for audit

**Files Modified**:
- `backend/src/routes/shares.ts`

**Critical Validation**:
```typescript
// Auto-detect email vs phone, compare against session
if (isEmail(invite.recipient_identifier)) {
  assert(session.user.email === invite.recipient_identifier);
} else {
  assert(session.user.phone === invite.recipient_identifier);
}
```

---

### Day 5: Jazz Agent Integration

**Tasks**:
1. Implement Jazz agent group management
2. Look up Jazz APIs for:
   - Loading CoValues as agent
   - Adding members to groups
   - Creating permission records
3. Create invite service with Jazz operations
4. Test invite acceptance end-to-end

**Files Created**:
- `backend/src/services/inviteService.ts`

**Jazz Operations**:
- `jazzAgent.load(folderId)` → Get folder CoValue
- `folder.accessGroup.addMember(userId, role)` → Grant access
- Create `MemberPermission` CoValue with metadata

---

## Phase 2: Permission Management API (2 days)

### Day 6: Collaborator Endpoints

**Tasks**:
1. Implement `GET /api/shares/folders/:id/collaborators`
2. Implement `PUT /api/shares/folders/:id/collaborators/:userId`
3. Implement `DELETE /api/shares/folders/:id/collaborators/:userId`
4. Authorization checks for admin-only actions

**Files Modified**:
- `backend/src/routes/shares.ts`

**Files Created**:
- `backend/src/services/permissionService.ts`

**Key Validation**:
- Cannot remove owner
- Only owner can remove admin
- Cannot modify own permission

---

### Day 7: Invite Management Endpoints

**Tasks**:
1. Implement `GET /api/shares/folders/:id/invites`
2. Implement `DELETE /api/shares/invites/:token`
3. Cleanup job for expired invites
4. Complete backend testing

**Files Modified**:
- `backend/src/routes/shares.ts`
- `backend/src/index.ts` - Add cleanup interval

**Files Created**:
- `backend/src/jobs/cleanupExpiredInvites.ts`

---

## Phase 3: Jazz Schema Extensions (3 days)

### Day 8: Schema Definition

**Tasks**:
1. Create `src/schemas/groups.ts`
2. Define `FolderAccessGroup` (Jazz group)
3. Define `MemberPermission` schema
4. Define `ShareSettings` schema
5. Export types for TypeScript

**Files Created**:
- `src/schemas/groups.ts`

**Pattern**:
```typescript
export const FolderAccessGroup = co.group();
export const MemberPermission = co.map({
  accountId: z.string(),
  permission: z.enum(['view', 'edit', 'admin']),
  ...
});
```

---

### Day 9: Extend FolderNode

**Tasks**:
1. Add optional sharing fields to `FolderNode` in `src/schemas/tree.ts`
2. Test backward compatibility (existing folders still work)
3. Document schema migration strategy

**Fields Added**:
- `accessGroup?: FolderAccessGroup`
- `permissions?: Array<PermissionMetadata>`
- `shareSettings?: ShareSettings`

**Testing**: Create folders, verify no breaking changes

---

### Day 10: Permission Helpers

**Tasks**:
1. Create `src/services/sharingService.ts`
2. Implement permission checking functions
3. Implement inheritance logic
4. Test permission hierarchy

**Functions**:
- `hasPermission(account, folder, requiredLevel)` → boolean
- `getEffectivePermission(account, folder)` → level | null
- `isShared(folder)` → boolean
- `getCollaboratorCount(folder)` → number

---

## Phase 4: Frontend Routing (1 day)

### Day 11: Add React Router

**Tasks**:
1. Install `react-router-dom`
2. Wrap app with `BrowserRouter`
3. Define routes for `/invite/:token`
4. Update navigation patterns

**Files Modified**:
- `src/App.tsx` - Add router
- `package.json` - Add dependency

**Route Structure**:
```
/ → Dashboard (AuthGate)
/invite/:token → InviteAcceptPage
/test → TestPage (dev only)
```

---

## Phase 5: Frontend Sharing UI (4 days)

### Day 12: ShareDialog Component

**Tasks**:
1. Create `src/components/sharing/ShareDialog.tsx`
2. Multi-input for email/phone identifiers
3. Permission selector (radio group)
4. Expiration selector (dropdown)
5. API integration for invite generation
6. Display share URLs with copy buttons

**Files Created**:
- `src/components/sharing/ShareDialog.tsx`
- `src/components/sharing/useShareDialog.tsx` (hook)
- `src/hooks/useSharing.ts` (API calls)

**UI Pattern**: Follow `ImportDialog` pattern with `Dialog` from Radix UI

---

### Day 13: InviteAcceptPage

**Tasks**:
1. Create `/invite/:token` route component
2. States: loading, auth check, preview, accepting, success, error
3. Token validation API call
4. Acceptance API call
5. Login redirect with token preservation
6. Error handling for all cases

**Files Created**:
- `src/pages/InviteAcceptPage.tsx`
- `src/utils/routing.ts` (URL utilities)

**Key States**:
- Not logged in → Redirect to OAuth
- Email mismatch → Show error
- Expired/invalid → Show error
- Success → Redirect to folder

---

### Day 14: ManageAccessDialog

**Tasks**:
1. Create `src/components/sharing/ManageAccessDialog.tsx`
2. List owner (read-only)
3. List collaborators with permission dropdowns
4. List pending invites (collapsible)
5. Remove/revoke actions with confirmations
6. Real-time updates via Jazz

**Files Created**:
- `src/components/sharing/ManageAccessDialog.tsx`
- `src/components/sharing/CollaboratorCard.tsx`
- `src/components/sharing/PendingInviteCard.tsx`

**UI Components**: Cards for each person, inline dropdowns, trash icons

---

### Day 15: FolderTree Integration

**Tasks**:
1. Add visual indicators to tree (shared badge, count)
2. Add "Share" to context menu
3. Add "Manage Access" to context menu
4. Add "Leave Folder" for collaborators
5. Add permission badges for non-owned folders

**Files Modified**:
- `src/components/tree/FolderTree.tsx`
- `src/components/tree/FolderContextMenu.tsx`

**Visual Indicators**:
- Badge: People icon + count
- Tooltips: "Shared with N people"
- Permission badges: View/Edit/Admin icons

---

## Phase 6: Integration & Testing (3 days)

### Day 16: Frontend-Backend Integration

**Tasks**:
1. Test full invite flow (generation → acceptance)
2. Test permission management (change, remove)
3. Test error cases (expired, mismatch, etc.)
4. Fix any bugs discovered

**Testing Checklist**:
- [ ] Generate invite as owner
- [ ] Accept invite as recipient
- [ ] Folder appears in recipient's tree
- [ ] Real-time edits sync between users
- [ ] Change collaborator permission
- [ ] Remove collaborator
- [ ] Revoke pending invite

---

### Day 17: Multi-User E2E Tests

**Tasks**:
1. Set up Playwright multi-context testing
2. Write E2E test: User A invites User B
3. Write E2E test: Permission changes
4. Write E2E test: Access revocation
5. Write E2E test: Email mismatch rejection

**Files Created**:
- `tests/e2e/sharing.spec.ts`

**Test Pattern**:
```typescript
test('sharing flow', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  // Test multi-user scenarios
});
```

---

### Day 18: Polish & Documentation

**Tasks**:
1. Add loading states and animations
2. Add success toasts for all actions
3. Add error boundaries
4. Write user documentation
5. Update CLAUDE.md with sharing info
6. Final code review

**Files Modified**:
- `CLAUDE.md` - Add sharing documentation
- `README.md` - Update features list

**Polish Items**:
- Loading spinners during API calls
- Success confetti on invite acceptance
- Clear error messages
- Accessibility labels
- Mobile responsive testing

---

## Phase 7: Security Audit & Deployment (2 days)

### Day 19: Security Review

**Tasks**:
1. Review token generation (cryptographic strength)
2. Review authorization checks (privilege escalation prevention)
3. Review rate limiting (abuse prevention)
4. Review input validation (injection prevention)
5. Test with security mindset (try to break it)

**Security Checklist**:
- [ ] Tokens are 256-bit cryptographically random
- [ ] All endpoints verify authentication
- [ ] Authorization prevents unauthorized access
- [ ] Rate limiting active on all public endpoints
- [ ] Input validation uses Zod schemas
- [ ] Error messages don't leak sensitive info
- [ ] Audit log captures all actions
- [ ] OAuth identifiers verified by provider

---

### Day 20: Deployment Prep & Handoff

**Tasks**:
1. Update environment variable documentation
2. Create deployment checklist
3. Write runbook for common issues
4. Final regression testing
5. Prepare for production deployment

**Documentation**:
- `.env.example` - Add `JAZZ_AGENT_SECRET`
- `DEPLOYMENT.md` - Deployment steps
- `RUNBOOK.md` - Troubleshooting guide

**Deployment Checklist**:
- [ ] Database migrations applied
- [ ] Jazz agent secret configured
- [ ] Rate limiting configured
- [ ] Audit log rotation set up
- [ ] Monitoring alerts configured
- [ ] Backup strategy in place

---

## Key Implementation Patterns

### Error Handling

```typescript
// Consistent error responses
interface ErrorResponse {
  error: string;          // Machine-readable code
  message: string;        // Human-readable message
  details?: unknown;      // Optional context
}
```

### Identifier Validation

```typescript
// Auto-detect email vs phone by syntax
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isPhone(s: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(s); // E.164 format
}
```

### Permission Checking

```typescript
// Check if user has required permission
if (!hasPermission(account, folder, 'admin')) {
  throw new Error('Insufficient permissions');
}
```

### Jazz Group Management

```typescript
// Jazz agent operations (exact API to be determined)
await jazzAgent.load(folderId);
await folder.accessGroup.addMember(recipientJazzAccountId, 'writer');
```

---

## Dependencies to Add

### Backend
```json
{
  "express-rate-limit": "^7.1.5",
  "zod": "^3.22.4"
}
```

### Frontend
```json
{
  "react-router-dom": "^6.21.0",
  "@types/react-router-dom": "^5.3.3"
}
```

---

## Environment Variables

### Backend
```env
# Existing
BETTER_AUTH_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
FRONTEND_URL=http://localhost:5173
PORT=3001

# New
JAZZ_AGENT_SECRET=xxx  # Jazz agent account secret
```

---

## Testing Strategy Summary

### Unit Tests
- Token generation and validation
- Identifier detection and normalization
- Permission hierarchy checks
- Database operations

### Integration Tests
- API endpoint flows (invite → accept)
- Jazz agent operations
- Error handling paths

### E2E Tests
- Multi-user scenarios (Playwright multi-context)
- Permission management flows
- Error cases (expired, mismatch, etc.)

### Manual Testing
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile responsive testing
- Accessibility testing (screen reader, keyboard nav)

---

## Success Metrics

- ✅ All API endpoints functional and tested
- ✅ Frontend components render correctly
- ✅ Multi-user E2E tests passing
- ✅ Security audit checklist complete
- ✅ No breaking changes to existing features
- ✅ Documentation complete
- ✅ Code review approved
- ✅ Performance acceptable (< 2s invite gen, < 3s acceptance)

---

## Risk Mitigation

### Risk: Jazz agent API unclear
**Mitigation**: Research Jazz docs early, prototype on Day -2

### Risk: BetterAuth session structure unknown
**Mitigation**: Inspect database early, add logging

### Risk: Multi-user testing complex
**Mitigation**: Set up Playwright multi-context early (Day 11)

### Risk: Real-time sync delays
**Mitigation**: Add optimistic updates, loading states

---

## Post-Implementation

### Monitoring
- Track invite generation rate
- Monitor acceptance rate (measure UX friction)
- Alert on high error rates
- Track API latency

### Iteration
- Gather user feedback on UX
- Monitor audit log for patterns
- Identify performance bottlenecks
- Plan Phase 2 features

---

**Implementation Start**: Day -2 (pre-sprint setup)
**Target Completion**: Day 18 (with 2-day buffer for issues)
**Total Duration**: 20 days

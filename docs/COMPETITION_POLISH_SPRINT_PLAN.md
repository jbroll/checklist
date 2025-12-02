# Competition Polish Sprint Plan

A focused sprint to add features that bring Bubblelist to parity with general checklist apps while maintaining our unique differentiators.

*Created: December 2025*

---

## Sprint Goal

Close feature gaps identified in market research that would make Bubblelist more competitive with general-purpose checklist apps like Todoist, Trello, Notion, and specialized reusable checklist apps like CheckLoop and Checkful.

**Our Unique Advantages to Preserve:**
- Template-session separation (no competitor has this)
- Hierarchical folder organization
- Nested categories within templates
- Encrypted sync
- True offline-first

**Gaps to Close:**
- Minor UX polish items that users expect from modern list apps

---

## Feature Backlog

### Priority 1: Very Low Effort (1-2 hours each)

#### 1.1 Item Count on Template Folders
**Effort:** 1 hour
**File:** `src/components/tree/FolderNodeView.tsx`

**Current State:** Template folders in tree view show only name and icon.

**Desired State:** Show item count badge, e.g., "Weekly Groceries (24 items)"

**Implementation:**
```typescript
// In FolderNodeView, after getting folder
const itemCount = folder.items?.filter(i => !i.archived).length || 0;

// In render, after name span
{isTemplate && itemCount > 0 && (
  <span className="text-xs text-neutral-500 ml-1">
    ({itemCount})
  </span>
)}
```

**Acceptance Criteria:**
- [ ] Template folders show item count in parentheses
- [ ] Count excludes archived items
- [ ] Organizational folders don't show count
- [ ] Count updates reactively when items added/removed

---

### Priority 2: Low Effort (2-4 hours each)

#### 2.1 Duplicate Template
**Effort:** 2-4 hours
**Files:**
- `src/components/tree/FolderNodeView.tsx` (menu item)
- `src/services/folderService.ts` (duplicate logic)

**Current State:** No way to copy a template.

**Desired State:** Menu option to duplicate a template with all its items.

**Implementation:**
1. Add "Duplicate" menu item in FolderNodeView dropdown
2. Create `duplicateTemplate(folder, account)` in folderService:
   - Deep copy folder with new ID
   - Copy all items with new IDs
   - Clear sessions (start fresh)
   - Append " (Copy)" to name
   - Add to same parent folder

**Acceptance Criteria:**
- [ ] "Duplicate" option in template context menu
- [ ] Creates exact copy of template structure
- [ ] All items copied with new IDs
- [ ] Sessions NOT copied (fresh template)
- [ ] Name has " (Copy)" suffix
- [ ] New template appears in same location

---

#### 2.2 Custom Session Names
**Effort:** 2-3 hours
**Files:**
- `src/schemas/tree.ts` (add name field)
- `src/components/session/SessionHeader.tsx` (display/edit)
- `src/components/session/StartSessionDialog.tsx` (optional name input)

**Current State:** Sessions auto-named by date (e.g., "Dec 2, 2025").

**Desired State:** Optional custom name (e.g., "Thanksgiving Prep", "Costco Run").

**Schema Change:**
```typescript
// In SessionData type
name?: string; // Optional custom name, falls back to date
```

**Implementation:**
1. Add optional `name` field to SessionData
2. In SessionHeader, show name if set, otherwise date
3. Add edit button to rename session
4. Optionally add name field to StartSessionDialog

**Acceptance Criteria:**
- [ ] Sessions can have custom names
- [ ] Falls back to date display if no name
- [ ] Can rename existing sessions
- [ ] Name shown in session list (SessionRowView)

---

#### 2.3 Keyboard Shortcuts
**Effort:** 2-3 hours
**Files:**
- New: `src/lib/useKeyboardShortcuts.ts`
- `src/components/session/SessionView.tsx`
- `src/components/editor/TemplateItemEditor.tsx`

**Current State:** No keyboard shortcuts.

**Desired State:** Power user keyboard navigation.

**Shortcuts to Implement:**
| Key | Action |
|-----|--------|
| `Enter` | Add new item (when in add mode) |
| `Escape` | Cancel current action / close dialog |
| `↑` / `↓` | Navigate items (when item selected) |
| `Space` | Toggle selected state |
| `x` | Toggle checked state |
| `/` | Focus search (if implemented) |

**Implementation:**
1. Create `useKeyboardShortcuts` hook
2. Register shortcuts at appropriate component levels
3. Show shortcut hints in tooltips

**Acceptance Criteria:**
- [ ] Enter submits new item form
- [ ] Escape cancels/closes
- [ ] Arrow keys navigate when item focused
- [ ] Space/x toggle states
- [ ] Shortcuts don't interfere with text input

---

### Priority 3: Medium Effort (3-6 hours each)

#### 3.1 Item Notes/Description
**Effort:** 3-4 hours
**Files:**
- `src/schemas/tree.ts` (add notes field)
- `src/components/session/SessionItemRow.tsx` (display)
- `src/components/editor/TemplateItemEditor.tsx` (edit)

**Current State:** Items have only name and quantity.

**Desired State:** Optional notes field for details.

**Use Cases:**
- "Brand: Kirkland"
- "Check expiry date"
- "Get the organic one"
- "Ask John about this"

**Schema Change:**
```typescript
// In TemplateItem type
notes?: string; // Optional item notes
```

**Implementation:**
1. Add optional `notes` field to TemplateItem
2. Show notes in smaller text below item name
3. Add notes input in item editor
4. Notes visible in both template editor and session view

**Acceptance Criteria:**
- [ ] Items can have optional notes
- [ ] Notes displayed below item name (muted text)
- [ ] Notes editable in template editor
- [ ] Notes visible in session view
- [ ] Notes included in export

---

#### 3.2 Search/Filter
**Effort:** 4-6 hours
**Files:**
- New: `src/components/ui/search-input.tsx`
- `src/components/session/SessionView.tsx`
- `src/components/editor/TemplateItemEditor.tsx`

**Current State:** No search capability.

**Desired State:** Filter items by name within template/session.

**Implementation:**
1. Add search input component
2. Filter items by fuzzy match on name
3. Highlight matching text
4. Show "No results" state
5. Clear button to reset filter

**Acceptance Criteria:**
- [ ] Search input in session header
- [ ] Filters items as you type
- [ ] Case-insensitive matching
- [ ] Shows result count
- [ ] Clear button resets
- [ ] Works in both session and template editor views

---

#### 3.3 Dark Mode
**Effort:** 4-6 hours
**Files:**
- `src/index.css` (CSS variables)
- `tailwind.config.js` (dark mode config)
- New: `src/lib/useTheme.ts`
- Various component files

**Current State:** Light mode only.

**Desired State:** System-aware dark mode with manual toggle.

**Implementation:**
1. Configure Tailwind for `class` dark mode strategy
2. Create CSS variables for colors
3. Add `useTheme` hook for system preference detection
4. Add theme toggle in settings/header
5. Apply dark classes throughout app

**Acceptance Criteria:**
- [ ] Respects system preference by default
- [ ] Manual toggle to override
- [ ] Preference persisted in localStorage
- [ ] All components styled for dark mode
- [ ] No flash of wrong theme on load

---

#### 3.4 PWA Install Prompt
**Effort:** 2-3 hours
**Files:**
- New: `src/components/ui/InstallPrompt.tsx`
- New: `src/lib/usePWAInstall.ts`
- `src/App.tsx`

**Current State:** App works as PWA but doesn't prompt installation.

**Desired State:** Prompt users to "Add to Home Screen" on mobile.

**Implementation:**
1. Listen for `beforeinstallprompt` event
2. Show custom install banner/button
3. Track if already installed
4. Dismiss permanently if declined

**Acceptance Criteria:**
- [ ] Install prompt appears on mobile (after brief delay)
- [ ] Can dismiss prompt
- [ ] Doesn't show if already installed
- [ ] Doesn't show on desktop (or shows subtly)
- [ ] Preference remembered

---

### Priority 4: Privacy/Cleanup

| Feature | Effort | Status | Notes |
|---------|--------|--------|-------|
| **Account deletion** | Medium (4-6h) | **DONE** | Delete Account menu item, confirmation dialog, DELETE /api/account endpoint, Jazz data cleanup before key deletion, local storage/IndexedDB cleanup. |
| **Data retention enforcement** | Medium (4-6h) | **DONE** | Implemented as immediate deletion (exceeds "within 30 days" requirement). Jazz data deleted while keys accessible, then keys destroyed (crypto-shredding). |
| **Don't store name/image from OAuth** | Low (1-2h) | **DONE** | Configured Google OAuth with `scope: ["openid", "email"]` and `disableDefaultScopes: true` - name/image never requested from provider. |

**Implementation details (commit b6d2d0b):**
- OAuth privacy: Name/image never hit our servers (not requested from Google)
- Account deletion flow: User data deleted from Jazz -> BetterAuth account deleted -> local cleanup
- Privacy policy updated with explicit crypto-shredding disclosure

### Priority 5: Larger Features (Future Consideration)

These are larger features that could differentiate Bubblelist further but require more significant effort:

| Feature | Effort | Notes |
|---------|--------|-------|
| Labels/Tags | 6-8h | Color-coded tags on items, filter by tag |
| Due Dates | 4-6h | Optional target date for sessions |
| Recurring Sessions | 8-12h | Auto-create sessions on schedule |
| Undo/Redo | 6-8h | Action history with undo capability |
| Activity Log | 4-6h | Show recent changes to template/session |
| Item Photos | 6-8h | Attach photos to items |
| Barcode Scanning | 8-12h | Add items by scanning (mobile) |

---

## Sprint Progress

### Completed
- [x] **Privacy/Cleanup: Account deletion** - Delete Account UI + API + Jazz cleanup
- [x] **Privacy/Cleanup: Data retention** - Immediate deletion with crypto-shredding
- [x] **Privacy/Cleanup: OAuth privacy** - Email-only scope (no name/image)

### Sprint Execution Plan

### Phase 1: Quick Wins (Day 1)
- [ ] 1.1 Item count on template folders

### Phase 2: Core Polish (Days 2-3)
- [ ] 2.1 Duplicate template
- [ ] 2.2 Custom session names
- [ ] 2.3 Keyboard shortcuts

### Phase 3: Enhanced UX (Days 4-5)
- [ ] 3.1 Item notes
- [ ] 3.2 Search/filter

### Phase 4: Visual Polish (Days 6-7)
- [ ] 3.3 Dark mode
- [ ] 3.4 PWA install prompt

---

## Success Metrics

After sprint completion, Bubblelist should:

1. **Match competitor basics:**
   - Item counts visible in navigation
   - Templates can be duplicated
   - Sessions can be named
   - Items can have notes

2. **Power user friendly:**
   - Keyboard navigation works
   - Search filters long lists

3. **Modern app feel:**
   - Dark mode available
   - PWA install prompt on mobile

---

## Competitive Position Post-Sprint

| Feature | Before | After | Competitors |
|---------|:------:|:-----:|:-----------:|
| Template duplication | ❌ | ✅ | ✅ All |
| Custom session names | ❌ | ✅ | ✅ Most |
| Item notes | ❌ | ✅ | ✅ Most |
| Search | ❌ | ✅ | ✅ All |
| Dark mode | ❌ | ✅ | ✅ Most |
| Keyboard shortcuts | ❌ | ✅ | ⚠️ Some |
| PWA install | ❌ | ✅ | ⚠️ Few |

**Maintained Unique Advantages:**
- ✅ Template-session separation (still unique)
- ✅ Hierarchical folders (rare)
- ✅ Nested categories (unique)
- ✅ Encrypted sync (rare)
- ✅ True offline-first (rare)

---

## References

- [Market Comparison](./MARKET_COMPARISON.md) - Competitive analysis
- [Architecture](../ARCHITECTURE.md) - System overview
- [CLAUDE.md](../CLAUDE.md) - Development guidelines

# Test Coverage Plan

This document outlines areas of the codebase that need improved test coverage, prioritized by criticality and complexity.

## Current Coverage Summary

- **Total test files**: 44
- **Total tests**: 1092
- **Well-covered areas**: Services (folder, template, session, subscription, import, user settings, view state), Import/Export (JSON, TXT, CSV), Utilities (path manipulation, sort order, file upload, CSV parsing, date formatting), Platform detection, Navigation, Session hooks

## ✅ Completed (Phase 1-7)

### Phase 1: Import System ✅
| File | Tests | Status |
|------|-------|--------|
| `src/services/import/baseImporter.ts` | 27 | ✅ Complete |
| `src/services/import/csvImporter.ts` | 22 | ✅ Complete |
| `src/services/import/sessionImporter.ts` | 25 | ✅ Complete |

**Covered scenarios:**
- [x] Duplicate item detection and handling
- [x] Sort order calculation for new items
- [x] CSV header detection and column mapping
- [x] Path hierarchy construction from flat CSV
- [x] Session state matching to existing items
- [x] Handling of unmatched items during session import

### Phase 2: Navigation & Interaction Modes ✅
| File | Tests | Status |
|------|-------|--------|
| `src/lib/useNavigationHistory.ts` | 21 | ✅ Complete |
| `src/lib/useSessionInteractionMode.ts` | 38 | ✅ Complete |

**Covered scenarios:**
- [x] URL hash parsing for all view types (tree, session, folder)
- [x] Browser back/forward button handling
- [x] Deep link generation and restoration
- [x] Mode transition validation (can't drag while editing)
- [x] Permission checks during mode changes

### Phase 3: Platform & Browser Detection ✅
| File | Tests | Status |
|------|-------|--------|
| `src/utils/inAppBrowserDetection.ts` | 33 | ✅ Complete |
| `src/lib/platformDetect.ts` | 33 | ✅ Complete |
| `src/lib/usePWAInstall.ts` | 14 | ✅ Complete |

**Covered scenarios:**
- [x] User agent parsing for each in-app browser type
- [x] Platform-specific instruction generation
- [x] iOS standalone detection
- [x] Android TWA detection
- [x] beforeinstallprompt event handling

### Phase 4: User Settings & State Management ✅
| File | Tests | Status |
|------|-------|--------|
| `src/services/userSettingsService.ts` | 38 | ✅ Complete |
| `src/services/viewStateService.ts` | 30 | ✅ Complete |
| `src/services/sessionCleanupService.ts` | 16 | ✅ Complete |

**Covered scenarios:**
- [x] Template-level setting overrides with fallback to global
- [x] View state persistence across sessions
- [x] Garbage collection of orphaned state entries
- [x] Session retention policy by subscription tier

### Phase 5: Categorization System ✅
| File | Tests | Status |
|------|-------|--------|
| `src/lib/categorization/domainLoader.ts` | 22 | ✅ Complete |
| `src/lib/categorization/categorization.ts` | 49 | ✅ (existing) |

**Covered scenarios:**
- [x] Basic categorization for common items
- [x] Fuzzy matching accuracy
- [x] Cache behavior under load (LRU eviction)
- [x] Domain loading and search

### Phase 6: Utilities ✅
| File | Tests | Status |
|------|-------|--------|
| `src/lib/utils.ts` | 38 | ✅ Complete |
| `src/utils/csvParser.ts` | 33 | ✅ Complete |

**Covered scenarios:**
- [x] Relative time formatting ("2 hours ago", "yesterday")
- [x] Session date formatting
- [x] CSV quoted field escaping and unescaping
- [x] ID generation uniqueness

### Phase 7: Session Hooks ✅
| File | Tests | Status |
|------|-------|--------|
| `src/components/session/useViewMode.ts` | 15 | ✅ Complete |
| `src/components/session/useSessionItems.ts` | 16 | ✅ Complete |
| `src/components/session/useNoteEditor.ts` | 17 | ✅ Complete |
| `src/components/session/useSessionHandlers.ts` | 30 | ✅ Complete |

---

## 🔲 Remaining (Not Yet Implemented)

### Priority 1: Authentication & Account Management

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/components/AuthGate.tsx` | 234 | High | OAuth flow, account deletion, session verification |
| `src/lib/auth-client.ts` | 16 | High | BetterAuth client configuration |
| `src/lib/jazz.tsx` | 71 | High | JazzProvider setup, anonymous account migration |

**Test scenarios needed:**
- [ ] Login/logout state transitions
- [ ] Account deletion with data cleanup
- [ ] Invite token handling during auth
- [ ] Anonymous-to-authenticated account migration
- [ ] Session verification edge cases

*Note: These require complex mocking of OAuth providers and Jazz infrastructure. Consider E2E coverage instead.*

### Priority 2: Gesture & Interaction Handling

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/lib/useItemInteraction.ts` | 169 | Medium | Single-click, long-press, drag detection |
| `src/lib/useDoubleTap.ts` | 53 | Medium | Double-tap for mobile and desktop |

**Test scenarios needed:**
- [ ] Click vs long-press timing thresholds
- [ ] Drag initiation after long-press
- [ ] Double-tap detection with synthetic click filtering
- [ ] Interaction cancellation on scroll

### Priority 3: Additional Session Hooks

| File | Lines | Notes |
|------|-------|-------|
| `src/components/session/useScrollPreservation.ts` | 60+ | Scroll position restoration |
| `src/components/session/useSessionDragDrop.ts` | 80+ | Drag-drop coordination |

**Test scenarios needed:**
- [ ] Scroll position capture and restoration
- [ ] Drag start/end/cancel handling
- [ ] Reorder zone drop handling
- [ ] Category drop handling

### Priority 4: Lower Priority Utilities

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/utils/fileUtils.ts` | 49 | Low | Export filename sanitization |
| `src/utils/fileDownload.ts` | 40 | Low | Download file generation |
| `src/lib/useTheme.ts` | 81 | Low | Theme persistence |

**Test scenarios needed:**
- [ ] Filename sanitization for special characters
- [ ] Theme localStorage persistence
- [ ] System preference media query handling

### Priority 5: Tree View Components

| File | Lines | Notes |
|------|-------|-------|
| `src/components/tree/TreeView.tsx` | 300+ | Main tree container |
| `src/components/tree/FolderNodeView.tsx` | 150+ | Folder rendering with context menu |
| `src/components/tree/TemplateItemView.tsx` | 200+ | Item rendering with interactions |

*Note: These are primarily tested via E2E tests. Unit tests would require extensive DOM mocking.*

---

## Implementation Summary

### Completed Tests by Phase

| Phase | Focus | Actual Tests |
|-------|-------|--------------|
| 1 | Import system | 74 |
| 2 | Navigation & interaction modes | 59 |
| 3 | Platform detection & in-app browser | 80 |
| 4 | User settings & view state | 84 |
| 5 | Categorization system | 22 |
| 6 | Utilities | 71 |
| 7 | Session hooks | 78 |

**Total new tests added: 468** (exceeded estimate of 130-170)

### Testing Patterns Used

1. **Services**: Pure function testing with mocked dependencies
2. **Hooks**: `@testing-library/react` with `renderHook`
3. **Browser APIs**: Mock `navigator`, `window.location`, `localStorage`

---

## Maintenance

This document should be updated when:
- New critical features are added
- Significant bugs are found in untested areas
- Test coverage is added to listed areas

---

*Last updated: 2025-12-30*
*Phases 1-7 completed with 468 new tests*

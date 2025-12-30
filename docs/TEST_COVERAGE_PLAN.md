# Test Coverage Plan

This document outlines areas of the codebase that need improved test coverage, prioritized by criticality and complexity.

## Current Coverage Summary

- **Total test files**: 26
- **Total tests**: 624
- **Well-covered areas**: Services (folder, template, session, subscription), Import/Export (JSON, TXT, CSV exporters), Utilities (path manipulation, sort order, file upload)

## Priority 1: Critical Business Logic

These areas handle core functionality where bugs would significantly impact users.

### Authentication & Account Management

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/components/AuthGate.tsx` | 234 | High | OAuth flow, account deletion, session verification, verified email handling |
| `src/lib/auth-client.ts` | 16 | High | BetterAuth client configuration, OAuth entry point |
| `src/lib/jazz.tsx` | 71 | High | JazzProvider setup, anonymous account migration during login |

**Test scenarios needed:**
- [ ] Login/logout state transitions
- [ ] Account deletion with data cleanup
- [ ] Invite token handling during auth
- [ ] Anonymous-to-authenticated account migration
- [ ] Session verification edge cases

### Import System (Untested Core)

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/services/import/baseImporter.ts` | 60+ | High | Shared logic for all importers, duplicate detection |
| `src/services/import/csvImporter.ts` | 60+ | High | CSV parsing with path hierarchy |
| `src/services/import/sessionImporter.ts` | 80+ | High | Session state import from CSV |

**Test scenarios needed:**
- [ ] Duplicate item detection and handling
- [ ] Sort order calculation for new items
- [ ] CSV header detection and column mapping
- [ ] Path hierarchy construction from flat CSV
- [ ] Session state matching to existing items
- [ ] Handling of unmatched items during session import

### User Settings & State Management

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/services/userSettingsService.ts` | 236 | High | Global autocomplete domain, auto-categorization preferences |
| `src/services/viewStateService.ts` | 286 | High | Expand/collapse state, garbage collection for stale entries |
| `src/services/sessionCleanupService.ts` | 60+ | Medium | Auto-archives sessions based on subscription tier |

**Test scenarios needed:**
- [ ] Template-level setting overrides with fallback to global
- [ ] View state persistence across sessions
- [ ] Garbage collection of orphaned state entries
- [ ] Session retention policy by subscription tier

## Priority 2: Complex Functionality

Areas with intricate logic that are prone to edge-case bugs.

### Navigation & URL Handling

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/lib/useNavigationHistory.ts` | 119 | High | URL hash parsing, browser history, deep linking |
| `src/lib/useSessionInteractionMode.ts` | 171 | Medium | State machine: normal → adding → editing → dragging |

**Test scenarios needed:**
- [ ] URL hash parsing for all view types (tree, session, folder)
- [ ] Browser back/forward button handling
- [ ] Deep link generation and restoration
- [ ] Mode transition validation (can't drag while editing)
- [ ] Permission checks during mode changes

### Platform & Browser Detection

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/utils/inAppBrowserDetection.ts` | 206 | High | Detects 13+ in-app browsers, OAuth fails without this |
| `src/lib/platformDetect.ts` | 93 | Medium | 6 platform types, 5 browser types |
| `src/lib/usePWAInstall.ts` | 60+ | Medium | PWA installation detection (standalone, iOS, TWA) |

**Test scenarios needed:**
- [ ] User agent parsing for each in-app browser type
- [ ] Platform-specific instruction generation
- [ ] iOS standalone detection
- [ ] Android TWA detection
- [ ] beforeinstallprompt event handling

### Gesture & Interaction Handling

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/lib/useItemInteraction.ts` | 169 | Medium | Single-click, long-press, drag detection |
| `src/lib/useDoubleTap.ts` | 53 | Medium | Double-tap for mobile and desktop |

**Test scenarios needed:**
- [ ] Click vs long-press timing thresholds
- [ ] Drag initiation after long-press
- [ ] Double-tap detection with synthetic click filtering
- [ ] Interaction cancellation on scroll

## Priority 3: Categorization System

The auto-categorization feature has complex logic that affects user experience.

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/lib/categorization/categorizer.ts` | 60+ | Medium | Main algorithm with user override support |
| `src/lib/categorization/preprocessor.ts` | 60+ | Medium | Token classification, quantity extraction |
| `src/lib/categorization/domainLoader.ts` | 60+ | Medium | Fuzzy search indexing with LRU cache |

**Test scenarios needed:**
- [ ] Basic categorization for common items
- [ ] User override persistence and priority
- [ ] Quantity and unit extraction ("2 lbs chicken")
- [ ] Brand detection and handling
- [ ] Fuzzy matching accuracy
- [ ] Cache behavior under load

## Priority 4: Utilities & Helpers

Lower risk but still valuable for regression prevention.

| File | Lines | Risk | Notes |
|------|-------|------|-------|
| `src/lib/utils.ts` | 209 | Medium | Date formatting, ID generation |
| `src/utils/csvParser.ts` | 115 | Medium | CSV parsing with quoted field handling |
| `src/utils/fileUtils.ts` | 49 | Low | Export filename sanitization |
| `src/utils/fileDownload.ts` | 40 | Low | Download file generation |
| `src/lib/useTheme.ts` | 81 | Low | Theme persistence, system preference detection |

**Test scenarios needed:**
- [ ] Relative time formatting ("2 hours ago", "yesterday")
- [ ] Session date formatting
- [ ] CSV quoted field escaping and unescaping
- [ ] Filename sanitization for special characters
- [ ] Theme localStorage persistence
- [ ] System preference media query handling

## Priority 5: UI Components (Selective)

Most UI components are tested via E2E tests, but some complex ones need unit tests.

### Session View Hooks

| File | Lines | Notes |
|------|-------|-------|
| `src/components/session/useNoteEditor.ts` | 80+ | Note editing state management |
| `src/components/session/useScrollPreservation.ts` | 60+ | Scroll position restoration |
| `src/components/session/useSessionHandlers.ts` | 200+ | All session action handlers |
| `src/components/session/useSessionItems.ts` | 60+ | Item filtering and partitioning |
| `src/components/session/useSessionDragDrop.ts` | 80+ | Drag-drop coordination |
| `src/components/session/useViewMode.ts` | 60+ | View mode cycling and persistence |

### Tree View Components

| File | Lines | Notes |
|------|-------|-------|
| `src/components/tree/TreeView.tsx` | 300+ | Main tree container |
| `src/components/tree/FolderNodeView.tsx` | 150+ | Folder rendering with context menu |
| `src/components/tree/TemplateItemView.tsx` | 200+ | Item rendering with interactions |

## Implementation Approach

### Testing Patterns

1. **Services**: Pure function testing with mocked dependencies
2. **Hooks**: Use `@testing-library/react-hooks` or `renderHook`
3. **Components**: Use `@testing-library/react` with user event simulation
4. **Browser APIs**: Mock `navigator`, `window.location`, `localStorage`

### Recommended Order

| Phase | Focus | Estimated Tests |
|-------|-------|-----------------|
| 1 | Import system (baseImporter, csvImporter) | 20-30 |
| 2 | Navigation & interaction modes | 15-20 |
| 3 | Platform detection & in-app browser | 25-30 |
| 4 | User settings & view state | 20-25 |
| 5 | Categorization system | 20-25 |
| 6 | Utilities (utils.ts, csvParser) | 15-20 |
| 7 | Session hooks (selective) | 15-20 |

**Total estimated new tests: 130-170**

## Maintenance

This document should be updated when:
- New critical features are added
- Significant bugs are found in untested areas
- Test coverage is added to listed areas

---

*Last updated: 2024-12-30*
*Generated during code review test coverage analysis*

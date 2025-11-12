# Simplified UI Test Coverage

This document outlines the test coverage for the new simplified shopping UI.

## Test Files

### Unit Tests

#### 1. Service Tests
**File**: `src/services/simplified/simplifiedSessionService.test.ts`

**Coverage** (11 tests):
- `getOrCreateCurrentSession()`:
  - Returns existing latest session when available
  - Skips archived sessions
  - Creates new session when none exist
  - Creates new session when all are archived
  - Sets currentSessionId on template

- `clearSessionState()`:
  - Resets all item states to unchecked/unselected
  - Resets counts to 0
  - Updates remainingCount based on non-archived items
  - Updates lastActivityAt timestamp
  - Handles non-existent sessions gracefully
  - Preserves structure for empty sessions

#### 2. Component Tests

##### InlineItemForm
**File**: `src/components/simplified/InlineItemForm.test.tsx`

**Coverage** (18 tests):
- Renders input and radio buttons
- Auto-focuses input on mount
- Defaults to "item" type
- Toggles between item/category types
- Submits with correct data
- Clears input after submission
- Refocuses for rapid entry
- Validates empty/whitespace inputs
- Trims whitespace from submissions
- Closes on button click
- Closes on Escape key
- Displays keyboard shortcut hints
- Handles rapid multiple submissions
- Preserves type selection across submissions

##### SimplifiedSessionView
**File**: `src/components/simplified/SimplifiedSessionView.test.tsx`

**Coverage** (14 tests):
- Renders session header with template name
- Displays all header controls (Clear, view toggle, Done, Add)
- Shows items in zone view
- Toggles between zone and flat views
- Calls onBack when clicking Done
- Calls clearSessionState when clicking Clear
- Shows/hides inline form
- Adds new items to template
- Updates session on checkbox toggle
- Calls archiveItem when deleting
- Shows empty state when no items
- Displays session date
- Handles missing session gracefully

### E2E Tests

**File**: `e2e/simplified-ui.spec.ts`

**Coverage** (18 test scenarios):

#### View Mode Toggle (4 tests)
- Shows Simplified View option in menu
- Switches to simplified view
- Persists view mode in localStorage
- Switches back to classic view

#### Template Selection (2 tests)
- Shows empty state when no templates
- Navigates to session view when selecting template

#### Session View (10 tests)
- Displays session header with controls
- Displays items in zone view
- Toggles between zone and flat views
- Checks and unchecks items
- Clears all checkboxes
- Shows inline form on Add Item click
- Adds items using inline form
- Closes inline form
- Shows trash icons when form is open
- Navigates back on Done click
- Maintains session state across navigation

#### Data Synchronization (2 tests)
- Reflects changes from classic UI
- Persists deleted items across both UIs

## Running Tests

### All Tests
```bash
npm run test:run
```

### Unit Tests Only
```bash
npm run test:run -- src/services/simplified/ src/components/simplified/
```

### E2E Tests
```bash
npm run test:e2e -- simplified-ui.spec.ts
```

### Watch Mode (for development)
```bash
npm run test -- simplified-ui
```

## Test Coverage Summary

| Component/Service | Unit Tests | E2E Coverage | Total |
|-------------------|------------|--------------|-------|
| simplifiedSessionService | 11 | N/A | 11 |
| InlineItemForm | 18 | 5 | 23 |
| SimplifiedSessionView | 14 | 10 | 24 |
| SimplifiedApp | 0 | 4 | 4 |
| SimplifiedTemplateSelector | 0 | 3 | 3 |
| SimplifiedHeader | 0 | Covered in parent | - |
| SimplifiedZoneView | 0 | Covered in parent | - |
| SimplifiedFlatView | 0 | Covered in parent | - |
| SimplifiedSessionItemRow | 0 | Covered in parent | - |
| **Total** | **43** | **22** | **65** |

## Key Testing Patterns

### Mocking Jazz CoValues
```typescript
const mockSession = {
  itemStates: {},
  $jazz: {
    id: 'session-1',
    set: vi.fn((key, value) => { session[key] = value; }),
  },
};
```

### Testing State Updates
```typescript
// Check that Jazz set method was called
expect(mockSession.$jazz.set).toHaveBeenCalledWith(
  'itemStates',
  expect.objectContaining({ /* ... */ })
);
```

### E2E Navigation Patterns
```typescript
// Wait for page load
await expect(page.getByRole('heading', { name: /bubblelist/i }))
  .toBeVisible({ timeout: 10000 });

// Switch to simplified view
await page.getByLabel('More options').click();
await page.getByRole('menuitem', { name: /simplified view/i }).click();
```

## Integration with Existing Tests

The simplified UI tests integrate seamlessly with existing test infrastructure:
- Uses same Vitest configuration
- Uses same Playwright setup for E2E
- Follows same mocking patterns for Jazz CoValues
- Maintains same test file organization

## Known Limitations

1. **SimplifiedHeader**, **SimplifiedZoneView**, **SimplifiedFlatView**, and **SimplifiedSessionItemRow** do not have dedicated unit tests but are thoroughly covered by:
   - Parent component (SimplifiedSessionView) unit tests
   - E2E tests that exercise all user interactions

2. **SimplifiedApp** and **SimplifiedTemplateSelector** rely primarily on E2E tests since they mainly handle routing/navigation logic.

## Future Test Enhancements

If needed, additional tests could be added for:
- [ ] Keyboard navigation in simplified UI
- [ ] Accessibility features (screen reader support)
- [ ] Mobile-specific interactions
- [ ] Performance testing with large item lists
- [ ] Concurrent editing scenarios (multiple users)
- [ ] Offline mode behavior
- [ ] Error recovery scenarios

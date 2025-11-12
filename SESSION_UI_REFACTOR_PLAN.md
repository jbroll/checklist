# Implementation Plan: Simplified Session UI

## Overview
Transform the session view into a simplified, direct-manipulation interface where users interact with a single "current session" that's always the latest session, with inline item creation and streamlined navigation.

---

## Phase 1: Data Model & Schema Updates

### 1. Review and Update ItemState Schema
- Examine current `ItemState` schema in `src/schemas/tree.ts`
- Confirm current properties: `selected`, `checked`, and any timestamp properties
- Remove timestamp properties if they exist (`selectedAt`, `checkedAt`, etc.)
- Keep core properties: `selected` (boolean), `checked` (boolean), `notes` (optional string)
- Update TypeScript types accordingly

### 2. Update Session Management Strategy
- Remove any "current session selection" logic - always use latest session
- Session is determined by: most recent `createdAt` timestamp
- If no sessions exist, create one dynamically on first interaction
- Document that sessions are now implicitly managed, not explicitly selected

---

## Phase 2: Session State Management

### 3. Implement "Get or Create Current Session" Logic
- Create utility function to find latest session by `createdAt`
- If no session exists, create new session with current timestamp
- Session creation should happen transparently when user enters session view
- Ensure session is properly linked to the template folder

### 4. Implement "Clear" Functionality
- Clear button resets ALL `selected` and `checked` flags to `false` across all items in current session
- Update session's `updatedAt` timestamp
- Does NOT create a new session - reuses existing session
- User can immediately start fresh shopping trip with clean checkboxes

### 5. Update Deletion Behavior
- When user deletes item/category in session view:
  - Set `archived: true` on the template item itself
  - Update template item's `updatedAt` timestamp
  - Session view automatically reflects deletion (filters out archived items)
- This is a hard consequence - deleted items are gone from template permanently (until unarchived)

---

## Phase 3: UI Component Architecture

### 6. Create SimplifiedSessionView Component
- Main container for the new simplified session interface
- Replaces or coexists with existing session view (implementation dependent)
- Manages view mode state: Zone/Flat toggle (no hierarchy mode)
- Contains header with Done button and view mode toggle
- Renders either zone-based or flat list based on toggle

### 7. Create InlineItemForm Component
- Triggered by plus (+) button in UI
- Displays inline form with:
  - Text input box for item/category name
  - Radio button selector: "Item" vs "Category"
  - Close (X) button to dismiss form
- On Enter key or submit:
  - Create new item or category in currently selected category
  - If no category selected, create at root level
  - Clear form and keep it open for rapid entry
- On Close (X), hide the inline form

### 8. Create SessionItemRow Component
- Displays each item/category with:
  - Checkbox for `checked` state
  - Item/category name
  - Conditional trash icon (visible when inline form is open OR always visible in available zone)
- Handle checkbox toggle: updates `checked` property on item state
- Handle trash click: soft deletes item from template (sets `archived: true`)
- Support category expansion/collapse if in hierarchy mode (only zone mode needs this)

### 9. Update Header Component
- Add/keep "Done" button - returns to template tree view
- Add/update view mode toggle:
  - Two options only: "Zone" and "Flat"
  - Remove "Hierarchy" option (or hide it in session view)
  - Toggle updates view state and re-renders session content

---

## Phase 4: Navigation & Mode Management

### 10. Remove Selection Mode Toggle
- Session view is ALWAYS in selection mode (checkboxes always visible)
- Remove any UI for toggling between editing/selection modes
- Inline form provides editing capability without mode switching

### 11. Implement Simplified Zone View
- Filter items into zones: Available, Selected, Checked
- Available: `selected: false, checked: false`
- Selected: `selected: true, checked: false`
- Checked: `checked: true` (regardless of selected)
- Display zones as separate sections with headers
- When inline form is open, show trash icons on all items in Available zone

### 12. Implement Flat View
- Single list of all items (not grouped by zone)
- Order by item position in template hierarchy (flattened depth-first)
- Each item shows checkbox and trash icon
- No category grouping or hierarchy display

### 13. Add Navigation Back to Tree View
- Done button in header returns to main template tree view
- Preserve user's location/folder in tree view if possible
- No state loss - all changes are already persisted via Jazz

---

## Phase 5: Data Operations & Synchronization

### 14. Implement Session-Template Synchronization
- Session view reads directly from template structure
- ItemState only stores `selected`, `checked`, `notes`
- All structural data (names, hierarchy, categories) comes from template
- When template changes (via deletion), session view automatically reflects changes

### 15. Implement Item Creation Flow
- User opens inline form with plus button
- User types name, selects Item or Category via radio
- On Enter/submit:
  - Create new TemplateItem with appropriate `type`
  - Add to currently selected category's children, or root if none selected
  - Create corresponding ItemState entry with `selected: false, checked: false`
  - Clear text input, keep form open for next entry

### 16. Implement Item Deletion Flow
- User clicks trash icon on item row
- Directly set `archived: true` on the template item
- Update item's `updatedAt` timestamp
- UI filters out archived items immediately (reactive Jazz update)
- No confirmation dialog - direct manipulation model

### 17. Handle Category Deletion
- When category is deleted (archived), all child items/categories are also archived
- Recursive archiving down the hierarchy
- Session view removes entire category and children from display
- User understands this is destructive (can document in help/tooltips)

---

## Phase 6: Edge Cases & Polish

### 18. Handle Empty States
- No items in template: Show helpful message, prompt to add items via inline form
- No selected items: Available and Selected zones are empty, only show appropriate message
- All items checked: Show completion message or celebration

### 19. Handle Session Creation Timing
- Entering session view for first time: Automatically create session
- Switching between templates: Each template gets its own latest session
- Session timestamps track when user last shopped this template

### 20. Optimize Trash Icon Visibility
- **Option A**: Show trash only when inline form is open
- **Option B**: Always show trash in Available zone
- Determine which provides better UX (less clutter vs. always accessible)
- Implement conditional rendering based on decision

### 21. Test Component Reuse vs. New Components
- Evaluate if existing tree/editor components can be adapted
- Likely need new components due to significantly different UX model
- May reuse low-level components (checkboxes, icons, buttons)
- Document decision and rationale

---

## Phase 7: Documentation & Cleanup

### 22. Update Architecture Documentation
- Document that sessions are now implicitly managed (always latest)
- Explain deletion behavior (template-level soft delete)
- Update data flow diagrams if they exist
- Clarify relationship between session view and template structure

### 23. Remove Obsolete Code
- Remove selection mode toggle logic
- Remove current session selection UI
- Remove any timestamp-related code for ItemState
- Clean up unused components or modes

### 24. Update User-Facing Documentation
- Explain simplified session workflow
- Document Clear button behavior
- Explain that deletions affect template
- Add guidance on inline form usage

---

## Key Functional Behaviors Summary

**Session Management**: Latest session is always current; created automatically if missing; Clear resets checkboxes

**Inline Form**: Plus button opens form; Enter creates item/category; X closes form; rapid entry workflow

**Deletion**: Trash icon sets `archived: true` on template item; affects template permanently; session view auto-updates

**View Modes**: Zone mode (Available/Selected/Checked) or Flat mode (single list); toggle in header; no hierarchy mode in session

**Navigation**: Done button returns to tree view; session view is always selection mode; no mode switching

**Data Flow**: Session reads from template structure; ItemState stores only `selected`/`checked`/`notes`; all changes sync via Jazz

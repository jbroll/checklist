# Implementation Plan: Simplified Session UI

## Overview
Create an ADDITIONAL simplified session interface that overlays on top of the existing data model. This is NOT a refactor of the existing UI - all existing components remain untouched. Users can toggle between the existing "Classic" view and the new "Simplified" view at the app level.

**Key Principles**:
- Existing UI and components remain completely intact
- New simplified UI uses entirely new components
- Both UIs share the same underlying data model (templates, sessions, items)
- App-level toggle switches between Classic and Simplified modes
- Simplified view presents a direct-manipulation interface with inline editing

---

## Phase 1: App-Level Setup

### 1. Create App-Level View Mode Toggle
- Add view mode state to App component: "classic" | "simplified"
- Create toggle UI component (button, switch, or menu item)
- Place toggle in app header or navigation
- Default to "classic" to preserve existing user experience
- Store preference in localStorage for persistence across sessions

### 2. Create Route/View Switching Logic
- Implement conditional rendering based on view mode
- When mode is "classic": render existing Dashboard/components
- When mode is "simplified": render new SimplifiedApp component tree
- Ensure smooth transitions between modes
- Both modes share same Jazz account and data context

### 3. Review ItemState Schema (Optional)
- Examine current `ItemState` schema in `src/schemas/tree.ts`
- Confirm current properties: `selected`, `checked`, and any timestamp properties
- If timestamp properties exist and are unused, consider removing them
- This is optional - existing schema should work fine for both UIs
- Any schema changes must not break existing Classic UI

---

## Phase 2: Session State Management (Simplified UI Only)

### 4. Implement "Get or Create Current Session" Logic
- Create NEW utility function specific to simplified UI
- Find latest session by `createdAt` timestamp
- If no session exists, create new session with current timestamp
- Session creation happens transparently when entering simplified session view
- Ensure session is properly linked to the template folder
- This logic is separate from existing session management in Classic UI

### 5. Implement "Clear" Functionality
- Clear button in simplified UI resets ALL `selected` and `checked` flags to `false`
- Operates on items in current session
- Update session's `updatedAt` timestamp
- Does NOT create a new session - reuses existing session
- User can immediately start fresh shopping trip with clean checkboxes

### 6. Implement Deletion Behavior
- When user deletes item/category in simplified session view:
  - Set `archived: true` on the template item itself
  - Update template item's `updatedAt` timestamp
  - Both UIs automatically reflect deletion (filters out archived items via Jazz reactivity)
- This is a hard consequence - deleted items are gone from template
- Applies to both Classic and Simplified UIs since template is shared

---

## Phase 3: New Component Architecture

### 7. Create SimplifiedApp Component
- Top-level container for entire simplified UI mode
- Rendered when app view mode is "simplified"
- Manages navigation between template selection and session view
- Does NOT modify or use existing Dashboard/tree components
- Completely independent component tree

### 8. Create SimplifiedTemplateSelector Component
- Shows list of template folders for user to choose from
- Simple list view (no complex tree navigation)
- Clicking template enters session view for that template
- "Back to Classic" option to return to classic UI

### 9. Create SimplifiedSessionView Component
- Main container for simplified session interface
- Completely NEW component, does not modify existing session components
- Manages view mode state: Zone/Flat toggle (no hierarchy mode)
- Contains header with Done button, Clear button, and view mode toggle
- Renders either zone-based or flat list based on toggle

### 10. Create InlineItemForm Component
- Triggered by plus (+) button in UI
- Displays inline form with:
  - Text input box for item/category name
  - Radio button selector: "Item" vs "Category"
  - Close (X) button to dismiss form
- On Enter key or submit:
  - Create new TemplateItem in current template
  - Add to currently selected category, or root if none selected
  - Clear form and keep it open for rapid entry
- On Close (X), hide the inline form

### 11. Create SimplifiedSessionItemRow Component
- NEW component for simplified view (does not modify existing row components)
- Displays each item/category with:
  - Checkbox for `checked` state
  - Item/category name
  - Conditional trash icon
- Handle checkbox toggle: updates `checked` property on item state
- Handle trash click: soft deletes item from template (sets `archived: true`)
- Support category expansion/collapse for zone view if needed

### 12. Create SimplifiedHeader Component
- NEW header component for simplified session view
- Contains:
  - "Done" button - returns to template selector
  - "Clear" button - resets all checkboxes
  - View mode toggle: "Zone" / "Flat" (two options only)
- Does not modify existing header components

---

## Phase 4: Simplified View Modes & Navigation

### 13. Implement Simplified Zone View
- NEW zone-based view within SimplifiedSessionView
- Filter items into three zones: Available, Selected, Checked
- Available: `selected: false, checked: false`
- Selected: `selected: true, checked: false`
- Checked: `checked: true` (regardless of selected)
- Display zones as separate sections with headers
- When inline form is open, show trash icons on all items in Available zone
- Checkboxes always visible (no mode toggle needed)

### 14. Implement Simplified Flat View
- NEW flat list view within SimplifiedSessionView
- Single list of all items (not grouped by zone)
- Order by item position in template hierarchy (flattened depth-first)
- Each item shows checkbox and trash icon
- No category grouping or hierarchy display
- Checkboxes always visible

### 15. Implement Simplified Navigation
- Done button in header returns to SimplifiedTemplateSelector
- No complex tree navigation (simplified UI stays simple)
- All changes are persisted via Jazz automatically
- User can switch to Classic UI anytime via app-level toggle

---

## Phase 5: Data Operations & Synchronization

### 16. Implement Session-Template Synchronization
- Simplified session view reads directly from shared template structure
- ItemState only stores `selected`, `checked`, `notes` (same as Classic UI)
- All structural data (names, hierarchy, categories) comes from template
- Changes in either UI automatically reflect in the other (Jazz reactivity)
- No migration or data duplication needed

### 17. Implement Item Creation Flow (Simplified UI)
- User opens inline form with plus button in simplified session view
- User types name, selects Item or Category via radio
- On Enter/submit:
  - Create new TemplateItem with appropriate `type`
  - Add to currently selected category's children, or root if none selected
  - Create corresponding ItemState entry with `selected: false, checked: false`
  - Clear text input, keep form open for rapid entry
- Created items visible in both Classic and Simplified UIs

### 18. Implement Item Deletion Flow (Simplified UI)
- User clicks trash icon in simplified session view
- Directly set `archived: true` on the template item
- Update item's `updatedAt` timestamp
- Both UIs filter out archived items immediately (reactive Jazz update)
- No confirmation dialog - direct manipulation model
- Affects shared template, so deletion visible in Classic UI too

### 19. Handle Category Deletion (Simplified UI)
- When category is deleted in simplified view, all child items/categories archived
- Recursive archiving down the hierarchy
- Both simplified and classic views remove category and children from display
- User understands this is destructive (document in help/tooltips)

---

## Phase 6: Edge Cases & Polish (Simplified UI)

### 20. Handle Empty States
- No items in template: Show helpful message in simplified view, prompt to add via inline form
- No selected items: Available and Selected zones are empty, show appropriate message
- All items checked: Show completion message or celebration
- No templates: Show message in SimplifiedTemplateSelector, suggest switching to Classic UI to create

### 21. Handle Session Creation Timing
- Entering simplified session view for first time: Automatically create session
- Switching between templates in simplified UI: Each template gets its own latest session
- Session timestamps track when user last shopped this template
- Same session data accessible from both Classic and Simplified UIs

### 22. Optimize Trash Icon Visibility
- **Option A**: Show trash only when inline form is open
- **Option B**: Always show trash in Available zone
- Determine which provides better UX (less clutter vs. always accessible)
- Implement conditional rendering based on decision
- This only affects simplified UI, Classic UI unchanged

### 23. Reuse Low-Level UI Components
- Reuse existing UI primitives (buttons, icons, checkboxes from ui/ folder)
- Create NEW high-level components (SimplifiedApp, SimplifiedSessionView, etc.)
- Do NOT modify existing Dashboard, TreeView, Editor components
- Keep component trees completely separate

---

## Phase 7: Documentation & Testing

### 24. Update Architecture Documentation
- Document dual-UI approach (Classic and Simplified modes)
- Explain that both UIs share same underlying data model
- Document simplified session management (always latest session)
- Explain deletion behavior (template-level soft delete affects both UIs)
- Update data flow diagrams to show both UI paths
- Clarify that existing Classic UI remains unchanged

### 25. Create Simplified UI Documentation
- Document how to toggle between Classic and Simplified modes
- Explain simplified session workflow (auto-create, Clear button, etc.)
- Document inline form usage for adding items
- Explain zone vs flat view modes
- Note that deletions in simplified UI affect template (visible in Classic too)
- Add screenshots or diagrams of simplified UI

### 26. Test Dual-UI Interactions
- Verify data changes in Classic UI appear in Simplified UI
- Verify data changes in Simplified UI appear in Classic UI
- Test switching between modes preserves state
- Test that archived items filter correctly in both UIs
- Verify localStorage persistence of view mode preference
- Ensure no breaking changes to existing Classic UI functionality

---

## Key Functional Behaviors Summary

**Dual-UI Architecture**:
- App-level toggle switches between Classic and Simplified modes
- Both UIs share same data model (templates, sessions, items)
- Changes in one UI automatically visible in the other (Jazz reactivity)
- Classic UI remains completely unchanged
- Simplified UI uses entirely new components

**Session Management (Simplified UI)**:
- Latest session is always current; created automatically if missing
- Clear button resets all checkboxes in current session
- No explicit session selection - simplified workflow

**Inline Form (Simplified UI)**:
- Plus button opens form; Enter creates item/category; X closes form
- Rapid entry workflow for adding multiple items
- Items created in simplified UI visible in Classic UI

**Deletion (Simplified UI)**:
- Trash icon sets `archived: true` on template item
- Affects shared template - deletion visible in both UIs
- No confirmation dialog - direct manipulation model

**View Modes (Simplified UI)**:
- Zone mode: Available/Selected/Checked sections
- Flat mode: Single list, no grouping
- Toggle in header; no hierarchy mode
- Checkboxes always visible (no mode switching)

**Navigation (Simplified UI)**:
- Done button returns to template selector
- Can switch to Classic UI anytime via app-level toggle
- Simple navigation - no complex tree structure

**Data Flow**:
- Both UIs read from same template structure
- ItemState stores `selected`/`checked`/`notes`
- All changes sync automatically via Jazz
- No data migration or duplication needed

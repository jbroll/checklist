/**
 * Session Service
 *
 * Pure functions for shopping session operations.
 * All Jazz database access for sessions goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account } from '../schemas';
import { Session } from '../schemas/tree';
import { findEntityById } from './entityFinder';
import { getTemplate } from './templateService';

/**
 * Create a new list session for a template
 */
export function createSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): string {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const now = new Date();

  // Count non-archived leaf items only (exclude categories)
  const activeItems = template.items.filter((item) => !item.archived && item.type === 'item');
  const remainingCount = activeItems.length;

  // Create new list session
  const newSession = Session.create(
    {
      itemStates: {},
      archived: false,
      categoryExpanded: {},
      viewMode: 'zone-in-hierarchy', // Default view mode
      selectedCount: 0,
      checkedCount: 0,
      remainingCount,
      owner: account,
      createdAt: now,
      lastActivityAt: now,
    },
    { owner: account },
  );

  // Add session to template
  template.sessions.$jazz.push(newSession);
  template.$jazz.set('updatedAt', new Date());

  return newSession.$jazz.id;
}

/**
 * Get session by ID from a template
 */
export function getSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): InstanceOfSchema<typeof Session> | null {
  const template = getTemplate(account, templateId);
  return findEntityById(template?.sessions, sessionId);
}

/**
 * Get all sessions from a template
 */
export function getSessions(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): Array<InstanceOfSchema<typeof Session>> {
  const template = getTemplate(account, templateId);
  if (!template?.sessions) return [];

  return template.sessions.filter((s) => s != null) as Array<InstanceOfSchema<typeof Session>>;
}

/**
 * Toggle item's "selected" state
 */
export function toggleItemSelected(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  // Initialize itemStates if not present
  const itemStates = session.itemStates || {};

  const currentState = itemStates[itemId];

  if (!currentState) {
    // Create new plain object state
    session.$jazz.set('itemStates', {
      ...itemStates,
      [itemId]: {
        selected: true,
        checked: false,
        selectedAt: new Date(),
      },
    });
  } else {
    // Toggle selected
    const newSelected = !currentState.selected;
    session.$jazz.set('itemStates', {
      ...itemStates,
      [itemId]: {
        ...currentState,
        selected: newSelected,
        selectedAt: newSelected ? new Date() : currentState.selectedAt,
        checked: newSelected ? currentState.checked : false,
        checkedAt: newSelected ? currentState.checkedAt : undefined,
      },
    });
  }

  // Update session activity
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Toggle item's "checked" state
 */
export function toggleItemChecked(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  const itemStates = session.itemStates || {};
  const currentState = itemStates[itemId];
  if (!currentState) throw new Error(`Item state ${itemId} not found in session`);

  const newCheckedState = !currentState.checked;
  session.$jazz.set('itemStates', {
    ...itemStates,
    [itemId]: {
      ...currentState,
      checked: newCheckedState,
      checkedAt: newCheckedState ? new Date() : undefined,
    },
  });

  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Update session counts (selected, checked, remaining)
 */
export function updateSessionCounts(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  const template = getTemplate(account, templateId);
  if (!template?.items) return;

  // Only count leaf items, not categories
  const activeItems = template.items.filter((item) => !item.archived && item.type === 'item');

  let selectedCount = 0;
  let checkedCount = 0;
  let remainingCount = 0;

  activeItems.forEach((item) => {
    const state = session.itemStates?.[item.id];
    if (!state || (!state.selected && !state.checked)) {
      remainingCount++;
    } else if (state.checked) {
      checkedCount++;
    } else if (state.selected) {
      selectedCount++;
    }
  });

  session.$jazz.set('selectedCount', selectedCount);
  session.$jazz.set('checkedCount', checkedCount);
  session.$jazz.set('remainingCount', remainingCount);
}

/**
 * Update session view mode
 */
export function updateViewMode(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  viewMode: 'flat' | 'hierarchy-in-zones' | 'zone-in-hierarchy',
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  session.$jazz.set('viewMode', viewMode);
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Batch select items
 */
export function batchSelectItems(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemIds: string[],
  selected: boolean,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  const itemStates = session.itemStates || {};
  const updatedStates = { ...itemStates };
  const now = new Date();

  itemIds.forEach((itemId) => {
    const currentState = updatedStates[itemId];

    if (!currentState && selected) {
      updatedStates[itemId] = {
        selected: true,
        checked: false,
        selectedAt: now,
      };
    } else if (currentState) {
      updatedStates[itemId] = {
        ...currentState,
        selected,
        selectedAt: selected ? now : currentState.selectedAt,
        checked: selected ? currentState.checked : false,
        checkedAt: selected ? currentState.checkedAt : undefined,
      };
    }
  });

  session.$jazz.set('itemStates', updatedStates);
  session.$jazz.set('lastActivityAt', now);
}

/**
 * Toggle selection for all items (select all if some unselected, deselect all if all selected)
 */
export function toggleSelectAllItems(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemIds: string[],
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  const itemStates = session.itemStates || {};

  // Check if all items are selected
  const allSelected = itemIds.every((id) => itemStates[id]?.selected);

  console.log('[toggleSelectAllItems] BEFORE:', {
    itemIds,
    allSelected,
    willSelect: !allSelected,
    itemStates: itemIds.map((id) => ({ id, selected: itemStates[id]?.selected })),
  });

  // Toggle: if all selected, deselect all; otherwise select all
  batchSelectItems(account, templateId, sessionId, itemIds, !allSelected);

  // Log after
  const newSession = getSession(account, templateId, sessionId);
  const newItemStates = newSession?.itemStates || {};
  console.log('[toggleSelectAllItems] AFTER:', {
    itemIds,
    newAllSelected: itemIds.every((id) => newItemStates[id]?.selected),
    newItemStates: itemIds.map((id) => ({ id, selected: newItemStates[id]?.selected })),
  });
}

/**
 * Invert selection for all items (selected → unselected, unselected → selected)
 */
export function invertItemSelection(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemIds: string[],
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  const itemStates = session.itemStates || {};
  const updatedStates = { ...itemStates };
  const now = new Date();

  console.log('[invertItemSelection] BEFORE:', {
    itemIds,
    itemStates: itemIds.map((id) => ({ id, selected: itemStates[id]?.selected })),
  });

  itemIds.forEach((itemId) => {
    const currentState = updatedStates[itemId];
    const currentlySelected = currentState?.selected || false;

    if (!currentState) {
      // Item has no state, so it's unselected - invert to selected
      updatedStates[itemId] = {
        selected: true,
        checked: false,
        selectedAt: now,
      };
    } else {
      // Invert the current selection state
      updatedStates[itemId] = {
        ...currentState,
        selected: !currentlySelected,
        selectedAt: !currentlySelected ? now : currentState.selectedAt,
        checked: !currentlySelected ? currentState.checked : false,
        checkedAt: !currentlySelected ? currentState.checkedAt : undefined,
      };
    }
  });

  session.$jazz.set('itemStates', updatedStates);
  session.$jazz.set('lastActivityAt', now);

  // Log after
  const newSession = getSession(account, templateId, sessionId);
  const newItemStates = newSession?.itemStates || {};
  console.log('[invertItemSelection] AFTER:', {
    itemIds,
    newItemStates: itemIds.map((id) => ({ id, selected: newItemStates[id]?.selected })),
  });
}

/**
 * Archive a session (soft delete)
 */
export function archiveSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  session.$jazz.set('archived', true);
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Unarchive a session
 */
export function unarchiveSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  session.$jazz.set('archived', false);
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Delete a session (hard delete - removes from template)
 */
export function deleteSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template?.sessions) throw new Error(`Template ${templateId} not found or has no sessions`);

  const sessionIndex = template.sessions.findIndex((s) => s?.$jazz.id === sessionId);
  if (sessionIndex === -1) {
    throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  }

  // Hard delete by removing from sessions array
  template.sessions.$jazz.splice(sessionIndex, 1);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Toggle category expanded state in session
 */
export function toggleCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  categoryKey: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  const categoryExpanded = session.categoryExpanded || {};
  const currentValue = categoryExpanded[categoryKey] ?? true;

  session.$jazz.set('categoryExpanded', {
    ...categoryExpanded,
    [categoryKey]: !currentValue,
  });
}

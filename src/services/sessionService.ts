/**
 * Session Service
 *
 * Pure functions for shopping session operations.
 * All Jazz database access for sessions goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { generateId } from '../lib/utils';
import type { Account, ItemState, SessionData, TemplateItem } from '../schema';
import { getTemplate } from './templateService';

type SessionsLike = SessionData[] | { [Symbol.iterator](): Iterator<SessionData> };

/**
 * Convert sessions (which may be CoList or array) to a plain array
 */
function getSessionsArray(sessions: SessionsLike | undefined | null): SessionData[] {
  if (!sessions) return [];
  return Array.isArray(sessions) ? sessions : Array.from(sessions as Iterable<SessionData>);
}

/**
 * Get session by ID, throwing if not found
 */
function getSessionOrThrow(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): SessionData {
  const template = getTemplate(account, templateId);
  if (!template?.sessions) throw new Error(`Template ${templateId} not found or has no sessions`);

  const sessions = getSessionsArray(template.sessions);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  return session;
}

/**
 * Create or update an item state with selection/check changes
 */
function createOrUpdateItemState(
  currentState: ItemState | undefined,
  selected: boolean,
  now: Date,
): ItemState {
  if (!currentState) {
    return {
      selected,
      checked: false,
      selectedAt: selected ? now : undefined,
    };
  }
  return {
    ...currentState,
    selected,
    selectedAt: selected ? now : currentState.selectedAt,
    checked: selected ? currentState.checked : false,
    checkedAt: selected ? currentState.checkedAt : undefined,
  };
}

/**
 * Helper to update a session in the template's sessions array
 * Since sessions are plain objects, we need to replace the entire array to trigger Jazz update
 */
function updateSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  updates: Partial<SessionData>,
): void {
  const template = getTemplate(account, templateId);
  if (!template?.sessions) throw new Error(`Template ${templateId} not found or has no sessions`);

  const sessions = getSessionsArray(template.sessions);
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
  if (sessionIndex === -1) {
    throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  }

  // Create new session object with updates
  const updatedSession: SessionData = {
    ...sessions[sessionIndex],
    ...updates,
  };

  // Create new sessions array with updated session
  const updatedSessions = [...template.sessions];
  updatedSessions[sessionIndex] = updatedSession;

  // Update template to trigger Jazz sync
  template.$jazz.set('sessions', updatedSessions);
}

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
  const activeItems = template.items.filter(
    (item: TemplateItem) => !item.archived && item.type === 'item',
  );

  // Initialize itemStates from template.defaultItems
  const itemStates: Record<string, ItemState> = {};
  const defaultItems = template.defaultItems || {};
  let selectedCount = 0;

  for (const item of activeItems) {
    if (defaultItems[item.id]) {
      itemStates[item.id] = {
        selected: true,
        checked: false,
        selectedAt: now,
      };
      selectedCount++;
    }
  }

  const remainingCount = activeItems.length - selectedCount;

  // Create new list session as plain JavaScript object
  const newSession: SessionData = {
    id: generateId(),
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy', // Default view mode
    selectedCount,
    checkedCount: 0,
    remainingCount,
    createdAt: now,
    lastActivityAt: now,
  };

  // Add session to template
  // Initialize sessions list if it doesn't exist (for older templates)
  if (!template.sessions) {
    template.$jazz.set('sessions', []);
  }

  // Create new array with added session to trigger Jazz update
  const updatedSessions = [...template.sessions, newSession];
  template.$jazz.set('sessions', updatedSessions);
  template.$jazz.set('updatedAt', new Date());

  return newSession.id;
}

/**
 * Get session by ID from a template
 */
export function getSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): SessionData | null {
  const template = getTemplate(account, templateId);
  if (!template?.sessions) return null;
  const sessions = getSessionsArray(template.sessions);
  return sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Get all sessions from a template
 */
export function getSessions(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): SessionData[] {
  const template = getTemplate(account, templateId);
  if (!template?.sessions) return [];
  return getSessionsArray(template.sessions).filter((s) => s != null);
}

/**
 * Get item's "selected" state
 */
export function getItemSelected(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
): boolean {
  const session = getSessionOrThrow(account, templateId, sessionId);
  return session.itemStates?.[itemId]?.selected || false;
}

/**
 * Set item's "selected" state explicitly
 */
export function setItemSelected(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
  selected: boolean,
): void {
  const session = getSessionOrThrow(account, templateId, sessionId);
  const itemStates = session.itemStates || {};
  const currentState = itemStates[itemId];

  // No change needed if item doesn't exist and we're deselecting
  if (!currentState && !selected) return;

  const now = new Date();
  const newItemStates: Record<string, ItemState> = {
    ...itemStates,
    [itemId]: createOrUpdateItemState(currentState, selected, now),
  };

  // Check if this is the first item being selected
  const hasAnySelectedItems = Object.values(itemStates).some((state) => state.selected);
  const isFirstSelection = selected && !hasAnySelectedItems;

  updateSession(account, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: now,
    ...(isFirstSelection ? { createdAt: now } : {}),
  });
}

/**
 * Toggle item's "selected" state (convenience function)
 */
export function toggleItemSelected(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
): void {
  const currentState = getItemSelected(account, templateId, sessionId, itemId);
  setItemSelected(account, templateId, sessionId, itemId, !currentState);
}

/**
 * Get item's "checked" state
 */
export function getItemChecked(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
): boolean {
  const session = getSessionOrThrow(account, templateId, sessionId);
  return session.itemStates?.[itemId]?.checked || false;
}

/**
 * Set item's "checked" state explicitly
 */
export function setItemChecked(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
  checked: boolean,
): void {
  const session = getSessionOrThrow(account, templateId, sessionId);
  const itemStates = session.itemStates || {};
  const currentState = itemStates[itemId];
  if (!currentState) throw new Error(`Item state ${itemId} not found in session`);

  const now = new Date();
  const newItemStates = {
    ...itemStates,
    [itemId]: {
      ...currentState,
      checked,
      checkedAt: checked ? now : undefined,
    },
  };

  updateSession(account, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: now,
  });
}

/**
 * Toggle item's "checked" state (convenience function)
 */
export function toggleItemChecked(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
): void {
  const currentState = getItemChecked(account, templateId, sessionId, itemId);
  setItemChecked(account, templateId, sessionId, itemId, !currentState);
}

/**
 * Update session-specific notes for an item
 */
export function updateSessionItemNotes(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  itemId: string,
  notes: string,
): void {
  const session = getSessionOrThrow(account, templateId, sessionId);
  const itemStates = session.itemStates || {};
  const currentState = itemStates[itemId];

  const newItemStates: Record<string, ItemState> = {
    ...itemStates,
    [itemId]: {
      selected: currentState?.selected || false,
      checked: currentState?.checked || false,
      selectedAt: currentState?.selectedAt,
      checkedAt: currentState?.checkedAt,
      notes: notes || undefined,
    },
  };

  updateSession(account, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: new Date(),
  });
}

/**
 * Update session counts (selected, checked, remaining)
 */
export function updateSessionCounts(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSessionOrThrow(account, templateId, sessionId);
  const template = getTemplate(account, templateId);
  if (!template?.items) return;

  // Only count leaf items, not categories
  const activeItems = template.items.filter(
    (item: TemplateItem) => !item.archived && item.type === 'item',
  );

  let selectedCount = 0;
  let checkedCount = 0;
  let remainingCount = 0;

  activeItems.forEach((item: TemplateItem) => {
    const state = session.itemStates?.[item.id];
    if (!state || (!state.selected && !state.checked)) {
      remainingCount++;
    } else if (state.checked) {
      checkedCount++;
    } else if (state.selected) {
      selectedCount++;
    }
  });

  updateSession(account, templateId, sessionId, {
    selectedCount,
    checkedCount,
    remainingCount,
  });
}

/**
 * Update session view mode
 */
export function updateViewMode(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  viewMode: 'flat' | 'zone-in-hierarchy',
): void {
  updateSession(account, templateId, sessionId, {
    viewMode,
    lastActivityAt: new Date(),
  });
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
  const session = getSessionOrThrow(account, templateId, sessionId);
  const itemStates = session.itemStates || {};
  const updatedStates = { ...itemStates };
  const now = new Date();

  for (const itemId of itemIds) {
    const currentState = updatedStates[itemId];
    // Skip if deselecting and item has no state
    if (!currentState && !selected) continue;
    updatedStates[itemId] = createOrUpdateItemState(currentState, selected, now);
  }

  updateSession(account, templateId, sessionId, {
    itemStates: updatedStates,
    lastActivityAt: now,
  });
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
  const session = getSessionOrThrow(account, templateId, sessionId);
  const itemStates = session.itemStates || {};
  const allSelected = itemIds.every((id) => itemStates[id]?.selected);
  batchSelectItems(account, templateId, sessionId, itemIds, !allSelected);
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
  const session = getSessionOrThrow(account, templateId, sessionId);
  const itemStates = session.itemStates || {};
  const updatedStates = { ...itemStates };
  const now = new Date();

  for (const itemId of itemIds) {
    const currentState = updatedStates[itemId];
    const currentlySelected = currentState?.selected || false;
    updatedStates[itemId] = createOrUpdateItemState(currentState, !currentlySelected, now);
  }

  updateSession(account, templateId, sessionId, {
    itemStates: updatedStates,
    lastActivityAt: now,
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
  updateSession(account, templateId, sessionId, {
    archived: true,
    lastActivityAt: new Date(),
  });
}

/**
 * Unarchive a session
 */
export function unarchiveSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  updateSession(account, templateId, sessionId, {
    archived: false,
    lastActivityAt: new Date(),
  });
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

  const sessions = getSessionsArray(template.sessions);
  const sessionExists = sessions.some((s) => s.id === sessionId);
  if (!sessionExists) {
    throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  }

  const updatedSessions = sessions.filter((s) => s.id !== sessionId);
  template.$jazz.set('sessions', updatedSessions);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Get category expanded state in session
 */
export function getCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  categoryKey: string,
): boolean {
  const session = getSessionOrThrow(account, templateId, sessionId);
  return session.categoryExpanded?.[categoryKey] ?? true;
}

/**
 * Set category expanded state in session explicitly
 */
export function setCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  categoryKey: string,
  expanded: boolean,
): void {
  const session = getSessionOrThrow(account, templateId, sessionId);
  updateSession(account, templateId, sessionId, {
    categoryExpanded: {
      ...session.categoryExpanded,
      [categoryKey]: expanded,
    },
  });
}

/**
 * Toggle category expanded state in session (convenience function)
 */
export function toggleCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
  categoryKey: string,
): void {
  const currentState = getCategoryExpanded(account, templateId, sessionId, categoryKey);
  setCategoryExpanded(account, templateId, sessionId, categoryKey, !currentState);
}

/**
 * Clear all item states in a session (reset all selected/checked flags)
 */
export function clearSessionState(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSessionOrThrow(account, templateId, sessionId);
  const newItemStates: Record<string, { selected: boolean; checked: boolean }> = {};

  for (const itemId of Object.keys(session.itemStates || {})) {
    newItemStates[itemId] = { selected: false, checked: false };
  }

  updateSession(account, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: new Date(),
  });

  updateSessionCounts(account, templateId, sessionId);
}

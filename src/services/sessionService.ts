/**
 * sessionService - pure functions over the rowboat relational graph implementing shopping/list
 * sessions over a template folder's items.
 *
 * A session lives in the template folder row's `sessions` json column (an array of `SessionData`).
 * Ported off Jazz (slice-2) to mirror `templateService.ts`: every function is headless, taking the
 * graph `g` as its first argument and the folder id (`templateId`) second — reads go through
 * `getTemplate(g, templateId)` (from `./templateService`), writes through `g.folder.update(id, …)`.
 * No React, no IndexedDB, no server.
 *
 * All timestamps are epoch-ms NUMBERS (`Date.now()`), matching the session/item schema.
 *
 * NO FALLBACKS: a missing template or session is a hard error (thrown), never a silent no-op.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { generateId } from '../lib/utils';
import type { ItemState, SessionData, schema, TemplateItem } from '../schema/folder';
import { getTemplate } from './templateService';

type Graph = RelationalGraph<typeof schema>;

// ============================================================================
// Internal Helper Functions
// ============================================================================

/** Read the template folder row, throwing if it doesn't exist or isn't a template folder. */
function requireTemplate(g: Graph, templateId: string) {
  const template = getTemplate(g, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);
  return template;
}

/** Get session by ID, throwing if the template or session is missing. */
function getSessionOrThrow(g: Graph, templateId: string, sessionId: string): SessionData {
  const template = requireTemplate(g, templateId);
  const session = template.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  return session;
}

/** Create or update an item state with selection/check changes. */
function createOrUpdateItemState(
  currentState: ItemState | undefined,
  selected: boolean,
  now: number,
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
 * Replace one session in the template's sessions array and write the whole array back. Throws if
 * the template or session is missing (NO FALLBACKS — a stray session id is a bug, not a no-op).
 */
async function updateSession(
  g: Graph,
  templateId: string,
  sessionId: string,
  updates: Partial<SessionData>,
): Promise<void> {
  const template = requireTemplate(g, templateId);
  const sessions = template.sessions;
  const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
  if (sessionIndex === -1) {
    throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  }

  const updatedSessions = [...sessions];
  updatedSessions[sessionIndex] = { ...sessions[sessionIndex], ...updates };

  await g.folder.update(templateId, { sessions: updatedSessions, updated_at: Date.now() });
}

// ============================================================================
// Session Operations
// ============================================================================

/** Create a new list session for a template (default items pre-selected). */
export async function createSession(g: Graph, templateId: string): Promise<string> {
  const template = requireTemplate(g, templateId);

  const now = Date.now();

  // Count non-archived leaf items only (exclude categories)
  const activeItems = template.items.filter((item) => !item.archived && item.type === 'item');

  // Initialize itemStates from template.default_items
  const itemStates: Record<string, ItemState> = {};
  const defaultItems = template.default_items;
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

  await g.folder.update(templateId, {
    sessions: [...template.sessions, newSession],
    updated_at: now,
  });

  return newSession.id;
}

/** Get session by ID from a template (null if the template or session is absent). */
export function getSession(g: Graph, templateId: string, sessionId: string): SessionData | null {
  const template = getTemplate(g, templateId);
  if (!template) return null;
  return template.sessions.find((s) => s.id === sessionId) || null;
}

/** Get all sessions from a template. */
export function getSessions(g: Graph, templateId: string): SessionData[] {
  const template = getTemplate(g, templateId);
  if (!template) return [];
  return template.sessions;
}

// ============================================================================
// Item Selected State
// ============================================================================

/** Get item's "selected" state. */
export function getItemSelected(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
): boolean {
  const session = getSessionOrThrow(g, templateId, sessionId);
  return session.itemStates[itemId]?.selected || false;
}

/** Set item's "selected" state explicitly. */
export async function setItemSelected(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
  selected: boolean,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const itemStates = session.itemStates;
  const currentState = itemStates[itemId];

  // No change needed if item doesn't exist and we're deselecting
  if (!currentState && !selected) return;

  const now = Date.now();
  const newItemStates: Record<string, ItemState> = {
    ...itemStates,
    [itemId]: createOrUpdateItemState(currentState, selected, now),
  };

  // Check if this is the first item being selected
  const hasAnySelectedItems = Object.values(itemStates).some((state) => state.selected);
  const isFirstSelection = selected && !hasAnySelectedItems;

  await updateSession(g, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: now,
    ...(isFirstSelection ? { createdAt: now } : {}),
  });
}

/** Toggle item's "selected" state (convenience function). */
export async function toggleItemSelected(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
): Promise<void> {
  const currentState = getItemSelected(g, templateId, sessionId, itemId);
  await setItemSelected(g, templateId, sessionId, itemId, !currentState);
}

// ============================================================================
// Item Checked State
// ============================================================================

/** Get item's "checked" state. */
export function getItemChecked(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
): boolean {
  const session = getSessionOrThrow(g, templateId, sessionId);
  return session.itemStates[itemId]?.checked || false;
}

/** Set item's "checked" state explicitly (throws if the item has no state yet). */
export async function setItemChecked(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
  checked: boolean,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const itemStates = session.itemStates;
  const currentState = itemStates[itemId];
  if (!currentState) throw new Error(`Item state ${itemId} not found in session`);

  const now = Date.now();
  const newItemStates: Record<string, ItemState> = {
    ...itemStates,
    [itemId]: {
      ...currentState,
      checked,
      checkedAt: checked ? now : undefined,
    },
  };

  await updateSession(g, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: now,
  });
}

/** Toggle item's "checked" state (convenience function). */
export async function toggleItemChecked(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
): Promise<void> {
  const currentState = getItemChecked(g, templateId, sessionId, itemId);
  await setItemChecked(g, templateId, sessionId, itemId, !currentState);
}

// ============================================================================
// Session Item Notes / Counts / View Mode
// ============================================================================

/** Update session-specific notes for an item (empty string clears the note). */
export async function updateSessionItemNotes(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemId: string,
  notes: string,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const itemStates = session.itemStates;
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

  await updateSession(g, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: Date.now(),
  });
}

/** Recompute and persist session counts (selected, checked, remaining) from leaf items. */
export async function updateSessionCounts(
  g: Graph,
  templateId: string,
  sessionId: string,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const template = requireTemplate(g, templateId);

  // Only count leaf items, not categories
  const activeItems = template.items.filter((item) => !item.archived && item.type === 'item');

  let selectedCount = 0;
  let checkedCount = 0;
  let remainingCount = 0;

  activeItems.forEach((item: TemplateItem) => {
    const state = session.itemStates[item.id];
    if (!state || (!state.selected && !state.checked)) {
      remainingCount++;
    } else if (state.checked) {
      checkedCount++;
    } else if (state.selected) {
      selectedCount++;
    }
  });

  await updateSession(g, templateId, sessionId, {
    selectedCount,
    checkedCount,
    remainingCount,
  });
}

/** Update session view mode. */
export async function updateViewMode(
  g: Graph,
  templateId: string,
  sessionId: string,
  viewMode: 'flat' | 'zone-in-hierarchy',
): Promise<void> {
  await updateSession(g, templateId, sessionId, {
    viewMode,
    lastActivityAt: Date.now(),
  });
}

// ============================================================================
// Batch Selection
// ============================================================================

/** Batch select (or deselect) a set of items. */
export async function batchSelectItems(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemIds: string[],
  selected: boolean,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const updatedStates = { ...session.itemStates };
  const now = Date.now();

  for (const itemId of itemIds) {
    const currentState = updatedStates[itemId];
    // Skip if deselecting and item has no state
    if (!currentState && !selected) continue;
    updatedStates[itemId] = createOrUpdateItemState(currentState, selected, now);
  }

  await updateSession(g, templateId, sessionId, {
    itemStates: updatedStates,
    lastActivityAt: now,
  });
}

/** Toggle selection for all items (select all if some unselected, deselect all if all selected). */
export async function toggleSelectAllItems(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemIds: string[],
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const itemStates = session.itemStates;
  const allSelected = itemIds.every((id) => itemStates[id]?.selected);
  await batchSelectItems(g, templateId, sessionId, itemIds, !allSelected);
}

/** Invert selection for each item (selected → unselected, unselected → selected). */
export async function invertItemSelection(
  g: Graph,
  templateId: string,
  sessionId: string,
  itemIds: string[],
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const updatedStates = { ...session.itemStates };
  const now = Date.now();

  for (const itemId of itemIds) {
    const currentState = updatedStates[itemId];
    const currentlySelected = currentState?.selected || false;
    updatedStates[itemId] = createOrUpdateItemState(currentState, !currentlySelected, now);
  }

  await updateSession(g, templateId, sessionId, {
    itemStates: updatedStates,
    lastActivityAt: now,
  });
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/** Archive a session (soft delete). */
export async function archiveSession(
  g: Graph,
  templateId: string,
  sessionId: string,
): Promise<void> {
  await updateSession(g, templateId, sessionId, {
    archived: true,
    lastActivityAt: Date.now(),
  });
}

/** Unarchive a session. */
export async function unarchiveSession(
  g: Graph,
  templateId: string,
  sessionId: string,
): Promise<void> {
  await updateSession(g, templateId, sessionId, {
    archived: false,
    lastActivityAt: Date.now(),
  });
}

/** Delete a session (hard delete - removes it from the template). */
export async function deleteSession(
  g: Graph,
  templateId: string,
  sessionId: string,
): Promise<void> {
  const template = requireTemplate(g, templateId);
  const sessions = template.sessions;
  const sessionExists = sessions.some((s) => s.id === sessionId);
  if (!sessionExists) {
    throw new Error(`Session ${sessionId} not found in template ${templateId}`);
  }

  await g.folder.update(templateId, {
    sessions: sessions.filter((s) => s.id !== sessionId),
    updated_at: Date.now(),
  });
}

// ============================================================================
// Session Category Expansion
// ============================================================================

/** Get category expanded state in a session (defaults to true for unknown categories). */
export function getCategoryExpanded(
  g: Graph,
  templateId: string,
  sessionId: string,
  categoryKey: string,
): boolean {
  const session = getSessionOrThrow(g, templateId, sessionId);
  return session.categoryExpanded?.[categoryKey] ?? true;
}

/** Set category expanded state in a session explicitly. */
export async function setCategoryExpanded(
  g: Graph,
  templateId: string,
  sessionId: string,
  categoryKey: string,
  expanded: boolean,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  await updateSession(g, templateId, sessionId, {
    categoryExpanded: {
      ...session.categoryExpanded,
      [categoryKey]: expanded,
    },
  });
}

/** Toggle category expanded state in a session (convenience function). */
export async function toggleCategoryExpanded(
  g: Graph,
  templateId: string,
  sessionId: string,
  categoryKey: string,
): Promise<void> {
  const currentState = getCategoryExpanded(g, templateId, sessionId, categoryKey);
  await setCategoryExpanded(g, templateId, sessionId, categoryKey, !currentState);
}

/** Clear all item states in a session (reset all selected/checked flags), then recompute counts. */
export async function clearSessionState(
  g: Graph,
  templateId: string,
  sessionId: string,
): Promise<void> {
  const session = getSessionOrThrow(g, templateId, sessionId);
  const newItemStates: Record<string, ItemState> = {};

  for (const itemId of Object.keys(session.itemStates)) {
    newItemStates[itemId] = { selected: false, checked: false };
  }

  await updateSession(g, templateId, sessionId, {
    itemStates: newItemStates,
    lastActivityAt: Date.now(),
  });

  await updateSessionCounts(g, templateId, sessionId);
}

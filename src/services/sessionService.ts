/**
 * Session Service
 *
 * Pure functions for shopping session operations.
 * All Jazz database access for sessions goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account } from '../schemas';
import { ItemState, ListSession } from '../schemas/tree';
import { getFolder } from './folderService';

/**
 * Create a new list session for a template folder
 */
export function createSession(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionName?: string,
): string {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);

  // Initialize sessions list if it's null (Jazz CoList might not be initialized yet)
  if (!folder.sessions) {
    folder.$jazz.set('sessions', []);
  }

  // Initialize items list if it's null
  if (!folder.items) {
    folder.$jazz.set('items', []);
  }

  // Generate auto-generated session name with timestamp if not provided
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM
  const name = sessionName || `${dateStr} ${timeStr}`;

  // Count non-archived leaf items only (exclude categories)
  const activeItems = folder.items.filter((item) => item && !item.archived && item.type === 'item');
  const remainingCount = activeItems.length;

  // Create new list session
  const newSession = ListSession.create(
    {
      name,
      templateFolderId: folderId,
      itemStates: {},
      status: 'active',
      archived: false,
      categoryExpanded: {},
      viewMode: 'zone-in-hierarchy', // Default view mode
      selectedCount: 0,
      checkedCount: 0,
      remainingCount,
      owner: account,
      startedAt: now,
      lastActivityAt: now,
    },
    { owner: account },
  );

  // Add session to folder
  folder.sessions.$jazz.push(newSession);
  folder.$jazz.set('updatedAt', new Date());

  return newSession.$jazz.id;
}

/**
 * Get session by ID from a folder
 */
export function getSession(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
): InstanceOfSchema<typeof ListSession> | null {
  const folder = getFolder(account, folderId);
  if (!folder?.sessions) return null;

  return folder.sessions.find((s) => s?.$jazz.id === sessionId) || null;
}

/**
 * Get all sessions from a folder
 */
export function getSessions(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
): Array<InstanceOfSchema<typeof ListSession>> {
  const folder = getFolder(account, folderId);
  if (!folder?.sessions) return [];

  return folder.sessions.filter((s) => s != null) as Array<InstanceOfSchema<typeof ListSession>>;
}

/**
 * Toggle item's "selected" state
 */
export function toggleItemSelected(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
  itemId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  // Initialize itemStates if not present
  if (!session.itemStates) {
    session.$jazz.set('itemStates', {});
  }

  const itemStates = session.itemStates;
  if (!itemStates) return;

  const currentState = itemStates[itemId];

  if (!currentState) {
    // Create new ItemState
    const newState = ItemState.create(
      {
        itemId,
        selected: true,
        checked: false,
        selectedAt: new Date(),
        checkedBy: account,
      },
      { owner: account },
    );
    // Use $jazz.set on the record to add the new state
    session.$jazz.set('itemStates', {
      ...itemStates,
      [itemId]: newState,
    });
  } else {
    // Toggle selected
    const newSelected = !currentState.selected;
    currentState.$jazz.set('selected', newSelected);
    if (newSelected) {
      currentState.$jazz.set('selectedAt', new Date());
    } else {
      // If deselecting, also clear checked state
      currentState.$jazz.set('checked', false);
      currentState.$jazz.set('checkedAt', undefined);
    }
  }

  // Update session activity
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Toggle item's "checked" state
 */
export function toggleItemChecked(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
  itemId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  const currentState = session.itemStates?.[itemId];
  if (!currentState) throw new Error(`Item state ${itemId} not found in session`);

  const newCheckedState = !currentState.checked;
  currentState.$jazz.set('checked', newCheckedState);
  if (newCheckedState) {
    currentState.$jazz.set('checkedAt', new Date());
    currentState.$jazz.set('checkedBy', account);
  } else {
    currentState.$jazz.set('checkedAt', undefined);
  }

  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Update session counts (selected, checked, remaining)
 */
export function updateSessionCounts(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  const folder = getFolder(account, folderId);
  if (!folder?.items) return;

  // Only count leaf items, not categories
  const activeItems = folder.items.filter((item) => item && !item.archived && item.type === 'item');

  let selectedCount = 0;
  let checkedCount = 0;
  let remainingCount = 0;

  activeItems.forEach((item) => {
    const state = session.itemStates?.[item.$jazz.id];
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
 * Complete a list session
 */
export function completeSession(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  session.$jazz.set('status', 'completed');
  session.$jazz.set('completedAt', new Date());
}

/**
 * Abandon a list session
 */
export function abandonSession(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  session.$jazz.set('status', 'abandoned');
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Update session view mode
 */
export function updateViewMode(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
  viewMode: 'flat' | 'hierarchy-in-zones' | 'zone-in-hierarchy',
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  session.$jazz.set('viewMode', viewMode);
  session.$jazz.set('lastActivityAt', new Date());
}

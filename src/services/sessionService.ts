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
  sessionName?: string,
): string {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  // Generate auto-generated session name with timestamp if not provided
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM
  const name = sessionName || `${dateStr} ${timeStr}`;

  // Count non-archived leaf items only (exclude categories)
  const activeItems = template.items.filter((item) => !item.archived && item.type === 'item');
  const remainingCount = activeItems.length;

  // Create new list session
  const newSession = Session.create(
    {
      name,
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
 * Complete a list session
 */
export function completeSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  session.$jazz.set('status', 'completed');
  session.$jazz.set('completedAt', new Date());
}

/**
 * Abandon a list session
 */
export function abandonSession(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): void {
  const session = getSession(account, templateId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in template ${templateId}`);

  session.$jazz.set('status', 'abandoned');
  session.$jazz.set('lastActivityAt', new Date());
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

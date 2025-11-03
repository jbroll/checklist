/**
 * Session Service
 *
 * Pure functions for shopping session operations.
 * All Jazz database access for sessions goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { GroceriesAccount } from '../schemas';
import { ItemState, ShoppingSession } from '../schemas/tree';
import { getFolder } from './folderService';

/**
 * Create a new shopping session for a template folder
 */
export function createSession(
  account: InstanceOfSchema<typeof GroceriesAccount>,
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

  // Count non-archived items
  const activeItems = folder.items.filter((item) => item && !item.archived);
  const remainingCount = activeItems.length;

  // Create new shopping session
  const newSession = ShoppingSession.create(
    {
      name,
      templateFolderId: folderId,
      itemStates: {},
      status: 'active',
      categoryExpanded: {},
      viewMode: 'hierarchy-in-zones', // Default view mode
      inCartCount: 0,
      completedCount: 0,
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
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  sessionId: string,
): InstanceOfSchema<typeof ShoppingSession> | null {
  const folder = getFolder(account, folderId);
  if (!folder?.sessions) return null;

  return folder.sessions.find((s) => s?.$jazz.id === sessionId) || null;
}

/**
 * Get all sessions from a folder
 */
export function getSessions(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
): Array<InstanceOfSchema<typeof ShoppingSession>> {
  const folder = getFolder(account, folderId);
  if (!folder?.sessions) return [];

  return folder.sessions.filter((s) => s != null) as Array<
    InstanceOfSchema<typeof ShoppingSession>
  >;
}

/**
 * Toggle item's "in cart" state
 */
export function toggleItemInCart(
  account: InstanceOfSchema<typeof GroceriesAccount>,
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
        inCart: true,
        purchased: false,
        addedToCartAt: new Date(),
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
    // Toggle inCart
    const newInCart = !currentState.inCart;
    currentState.$jazz.set('inCart', newInCart);
    if (newInCart) {
      currentState.$jazz.set('addedToCartAt', new Date());
    } else {
      // If removing from cart, also clear purchased state
      currentState.$jazz.set('purchased', false);
      currentState.$jazz.set('purchasedAt', undefined);
    }
  }

  // Update session activity
  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Toggle item's "purchased" state
 */
export function toggleItemPurchased(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  sessionId: string,
  itemId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  const currentState = session.itemStates?.[itemId];
  if (!currentState) throw new Error(`Item state ${itemId} not found in session`);

  const newPurchasedState = !currentState.purchased;
  currentState.$jazz.set('purchased', newPurchasedState);
  if (newPurchasedState) {
    currentState.$jazz.set('purchasedAt', new Date());
    currentState.$jazz.set('checkedBy', account);
  } else {
    currentState.$jazz.set('purchasedAt', undefined);
  }

  session.$jazz.set('lastActivityAt', new Date());
}

/**
 * Update session counts (in cart, completed, remaining)
 */
export function updateSessionCounts(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  sessionId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  const folder = getFolder(account, folderId);
  if (!folder?.items) return;

  const activeItems = folder.items.filter((item) => item && !item.archived);

  let inCartCount = 0;
  let completedCount = 0;
  let remainingCount = 0;

  activeItems.forEach((item) => {
    const state = session.itemStates?.[item.$jazz.id];
    if (!state || (!state.inCart && !state.purchased)) {
      remainingCount++;
    } else if (state.purchased) {
      completedCount++;
    } else if (state.inCart) {
      inCartCount++;
    }
  });

  session.$jazz.set('inCartCount', inCartCount);
  session.$jazz.set('completedCount', completedCount);
  session.$jazz.set('remainingCount', remainingCount);
}

/**
 * Complete a shopping session
 */
export function completeSession(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  sessionId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  session.$jazz.set('status', 'completed');
  session.$jazz.set('completedAt', new Date());
}

/**
 * Abandon a shopping session
 */
export function abandonSession(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  sessionId: string,
): void {
  const session = getSession(account, folderId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found in folder ${folderId}`);

  session.$jazz.set('status', 'abandoned');
  session.$jazz.set('lastActivityAt', new Date());
}

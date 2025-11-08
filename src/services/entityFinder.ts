/**
 * Generic entity finder utilities
 *
 * Reduces duplication in entity lookup logic across services.
 */

/**
 * Finds an entity by its Jazz ID in a collection
 *
 * @param collection - Array-like collection of Jazz entities (may contain null/undefined)
 * @param id - Entity ID to search for
 * @returns Found entity or null
 *
 * @example
 * const folder = findEntityById(account.root.nodes, folderId);
 * const item = findEntityById(folder.items, itemId);
 */
export function findEntityById<T extends { $jazz: { id: string } }>(
  collection: Iterable<T | null | undefined> | null | undefined,
  id: string,
): T | null {
  if (!collection) return null;

  for (const entity of collection) {
    if (entity?.$jazz.id === id) {
      return entity;
    }
  }

  return null;
}

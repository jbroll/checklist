/**
 * Generic entity updater utilities
 *
 * Reduces duplication in Jazz entity update operations.
 */

/**
 * Updates multiple fields on a Jazz entity and sets updatedAt timestamp
 *
 * @param entity - Jazz entity to update
 * @param updates - Object with field names and values to update
 *
 * @example
 * updateEntity(item, { name: newName, path: newPath });
 * // Equivalent to:
 * // item.$jazz.set('name', newName);
 * // item.$jazz.set('path', newPath);
 * // item.$jazz.set('updatedAt', new Date());
 */
// biome-ignore lint/suspicious/noExplicitAny: Jazz $jazz.set has generic signature requiring flexible types
export function updateEntity<T extends { $jazz: { set: (key: any, value: any) => void } }>(
  entity: T,
  updates: Record<string, unknown>,
): void {
  // Apply all updates
  for (const [key, value] of Object.entries(updates)) {
    // biome-ignore lint/suspicious/noExplicitAny: Jazz $jazz.set requires flexible types
    entity.$jazz.set(key as any, value);
  }

  // Always update timestamp
  // biome-ignore lint/suspicious/noExplicitAny: Jazz $jazz.set requires flexible types
  entity.$jazz.set('updatedAt' as any, new Date());
}

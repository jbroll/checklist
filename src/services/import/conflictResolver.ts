/**
 * Conflict resolution logic
 *
 * Handles name conflicts when importing folders and items.
 */

/**
 * Generic helper to resolve naming conflicts by appending numbered suffixes
 *
 * @param baseName - Original name
 * @param exists - Function to check if a candidate name already exists
 * @param formatCandidate - Function to format the candidate name with counter
 * @param startCounter - Starting counter value (default: 1)
 * @param maxAttempts - Maximum resolution attempts (default: 100)
 * @returns Unique name that doesn't conflict
 */
function resolveNameConflict(
  baseName: string,
  exists: (candidate: string) => boolean,
  formatCandidate: (base: string, counter: number) => string,
  startCounter = 1,
  maxAttempts = 100,
): string {
  let counter = startCounter;
  let candidate = formatCandidate(baseName, counter);

  while (exists(candidate)) {
    counter++;
    candidate = formatCandidate(baseName, counter);

    if (counter > maxAttempts) {
      throw new Error(`Unable to resolve name conflict after ${maxAttempts} attempts`);
    }
  }

  return candidate;
}

/**
 * Check if a name would conflict with existing items in a folder
 *
 * @param itemName - Name to check
 * @param existingNames - Array of existing item names
 * @returns true if name conflicts
 */
export function itemNameConflicts(itemName: string, existingNames: string[]): boolean {
  const normalizedName = itemName.trim().toLowerCase();
  return existingNames.some((name) => name.trim().toLowerCase() === normalizedName);
}

/**
 * Generate unique item name if conflict exists
 *
 * @param itemName - Original item name
 * @param existingNames - Array of existing item names
 * @returns Unique name (may be same as original if no conflict)
 */
export function resolveItemNameConflict(itemName: string, existingNames: string[]): string {
  if (!itemNameConflicts(itemName, existingNames)) {
    return itemName;
  }

  return resolveNameConflict(
    itemName,
    (candidate) => itemNameConflicts(candidate, existingNames),
    (base, counter) => `${base} (${counter})`,
    2, // Start with (2) since (1) would be the original with implicit counter
  );
}

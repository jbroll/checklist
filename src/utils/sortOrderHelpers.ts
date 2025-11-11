/**
 * Sort Order Helpers
 *
 * Utilities for managing fractional sort order values.
 * Uses midpoint calculation to insert items between existing items.
 */

/**
 * Calculate a new sortOrder between two items using fractional values
 *
 * @param before - sortOrder of the item before the insertion point (or undefined if at start)
 * @param after - sortOrder of the item after the insertion point (or undefined if at end)
 * @returns A sortOrder value that places the item between before and after
 *
 * @example
 * calculateMidpointSortOrder(1.0, 3.0) // Returns 2.0
 * calculateMidpointSortOrder(1.0, 1.5) // Returns 1.25
 * calculateMidpointSortOrder(undefined, 5.0) // Returns 2.5 (before first item)
 * calculateMidpointSortOrder(10.0, undefined) // Returns 11.0 (after last item)
 */
export function calculateMidpointSortOrder(
  before: number | undefined,
  after: number | undefined,
): number {
  // If both are undefined, start at 1.0
  if (before === undefined && after === undefined) {
    return 1.0;
  }

  // If inserting at the beginning (before first item)
  if (before === undefined && after !== undefined) {
    // Place at half of the first item's sortOrder
    return after / 2;
  }

  // If inserting at the end (after last item)
  if (before !== undefined && after === undefined) {
    // Add 1.0 to the last item's sortOrder
    return before + 1.0;
  }

  // Normal case: between two items
  if (before !== undefined && after !== undefined) {
    return (before + after) / 2;
  }

  // Fallback (should never reach here)
  return 1.0;
}

/**
 * Check if we need to renumber sortOrder values due to precision limits
 *
 * @param sortOrder - The calculated sortOrder value
 * @returns true if the value is too close to its neighbors and we should renumber
 */
export function needsRenumbering(sortOrder: number): boolean {
  // If the fractional part is getting too small (less than 0.0001), renumber
  const fractional = sortOrder % 1;
  return fractional !== 0 && fractional < 0.0001;
}

/**
 * Renumber all items at a given level with clean integer values
 *
 * @param items - Items to renumber (should all be siblings)
 * @returns Updated items with sequential sortOrder values (1.0, 2.0, 3.0, ...)
 */
export function renumberSortOrders<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.map((item, index) => ({
    ...item,
    sortOrder: (index + 1) * 1.0,
  }));
}

/**
 * Get siblings at the same hierarchical level
 *
 * @param items - All items
 * @param parentPath - Parent path to filter by (undefined for root level)
 * @param getParentPath - Function to extract parent path from an item
 * @returns Items that share the same parent
 */
export function getSiblings<T>(
  items: T[],
  parentPath: string | undefined,
  getParentPath: (item: T) => string | undefined,
): T[] {
  return items.filter((item) => getParentPath(item) === parentPath);
}

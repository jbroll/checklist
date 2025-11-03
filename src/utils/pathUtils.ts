/**
 * Path manipulation utilities for folder and item hierarchy
 */

/**
 * Extracts the parent path from a full path
 * @example getParentPath("stores/wegmans") => "stores"
 * @example getParentPath("stores") => undefined
 */
export function getParentPath(fullPath: string): string | undefined {
  const lastSlashIndex = fullPath.lastIndexOf('/');
  return lastSlashIndex > 0 ? fullPath.substring(0, lastSlashIndex) : undefined;
}

/**
 * Extracts the name from a full path
 * @example getNameFromPath("stores/wegmans") => "wegmans"
 * @example getNameFromPath("stores") => "stores"
 */
export function getNameFromPath(fullPath: string): string {
  const lastSlashIndex = fullPath.lastIndexOf('/');
  return lastSlashIndex >= 0 ? fullPath.substring(lastSlashIndex + 1) : fullPath;
}

/**
 * Creates a child path by combining parent and child names
 * @example createChildPath("produce", "fruits") => "produce/fruits"
 * @example createChildPath(undefined, "produce") => "produce"
 */
export function createChildPath(parentPath: string | undefined, childName: string): string {
  return parentPath ? `${parentPath}/${childName}` : childName;
}

/**
 * Gets the depth level of a path (0-indexed)
 * @example getPathDepth("produce") => 0
 * @example getPathDepth("produce/fruits") => 1
 * @example getPathDepth("produce/fruits/apples") => 2
 */
export function getPathDepth(path: string): number {
  return path.split('/').length - 1;
}

/**
 * Checks if one path is a descendant of another
 * @example isDescendantPath("produce/fruits/apples", "produce") => true
 * @example isDescendantPath("produce", "produce/fruits") => false
 */
export function isDescendantPath(descendantPath: string, ancestorPath: string): boolean {
  return descendantPath.startsWith(`${ancestorPath}/`);
}

/**
 * Normalizes a name for use in a path (lowercase, replace spaces with hyphens)
 * @example normalizePathSegment("Fresh Produce") => "fresh-produce"
 */
export function normalizePathSegment(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

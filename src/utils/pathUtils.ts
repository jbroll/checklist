/**
 * Path manipulation utilities for folder and item hierarchy
 * These functions work with path strings only - no UI, no graph objects
 */

/**
 * Separator character for hierarchical paths.
 * Using ASCII control character (SOH - Start of Heading) to avoid conflicts
 * with user-entered category names that might contain forward slashes.
 */
export const PATH_SEPARATOR = '\x01';

export interface PathUpdateResult {
  newPath: string;
  isValid: boolean;
  error?: string;
}

/**
 * Extracts the parent path from a full path.
 * "stores\x01wegmans" -> "stores"; "stores" -> undefined.
 */
export function getParentPath(fullPath: string): string | undefined {
  const lastSlashIndex = fullPath.lastIndexOf(PATH_SEPARATOR);
  return lastSlashIndex > 0 ? fullPath.substring(0, lastSlashIndex) : undefined;
}

/**
 * Extracts the name from a full path.
 * "stores\x01wegmans" -> "wegmans"; "stores" -> "stores".
 */
export function getNameFromPath(fullPath: string): string {
  const lastSlashIndex = fullPath.lastIndexOf(PATH_SEPARATOR);
  return lastSlashIndex >= 0 ? fullPath.substring(lastSlashIndex + 1) : fullPath;
}

/**
 * Creates a child path by combining parent and child names.
 * ("produce", "fruits") -> "produce\x01fruits"; (undefined, "produce") -> "produce".
 */
export function createChildPath(parentPath: string | undefined, childName: string): string {
  return parentPath ? `${parentPath}${PATH_SEPARATOR}${childName}` : childName;
}

/**
 * Gets the depth level of a path (0-indexed).
 * "produce" -> 0; "produce\x01fruits" -> 1; "produce\x01fruits\x01apples" -> 2.
 */
export function getPathDepth(path: string): number {
  return path.split(PATH_SEPARATOR).length - 1;
}

/**
 * Checks if one path is a descendant of another.
 * ("produce\x01fruits\x01apples", "produce") -> true; ("produce", "produce\x01fruits") -> false.
 */
export function isDescendantPath(descendantPath: string, ancestorPath: string): boolean {
  return descendantPath.startsWith(`${ancestorPath}${PATH_SEPARATOR}`);
}

/**
 * Calculate what the new path should be when moving a node
 * Simple: target path + PATH_SEPARATOR + folder name (or just folder name if no target)
 */
export function calculateNewPath(
  nodeName: string,
  currentPath: string,
  targetParentPath: string | undefined,
): PathUpdateResult {
  // Use name as-is (no normalization)
  const normalizedName = nodeName.trim();

  // New path is simply: target path + name, or just name if at root
  const newPath = targetParentPath
    ? `${targetParentPath}${PATH_SEPARATOR}${normalizedName}`
    : normalizedName;

  // Validation: Can't move into itself
  if (targetParentPath === currentPath) {
    return {
      newPath: currentPath,
      isValid: false,
      error: 'Cannot move a folder into itself',
    };
  }

  // Validation: Can't move into descendants
  if (targetParentPath?.startsWith(`${currentPath}${PATH_SEPARATOR}`)) {
    return {
      newPath: currentPath,
      isValid: false,
      error: 'Cannot move a folder into itself or its descendants',
    };
  }

  // Check if already at this location
  const currentParent = getParentPath(currentPath);
  if (targetParentPath === currentParent) {
    return {
      newPath: currentPath,
      isValid: false,
      error: 'Already at this location',
    };
  }

  return { newPath, isValid: true };
}

/**
 * Calculate new paths for all descendants when a folder is moved
 * Simple: replace old path prefix with new path prefix
 */
export function calculateDescendantPaths(
  oldParentPath: string,
  newParentPath: string,
  allPaths: Array<{ id: string; path: string }>,
): Array<{ id: string; oldPath: string; newPath: string }> {
  const updates: Array<{ id: string; oldPath: string; newPath: string }> = [];

  for (const item of allPaths) {
    // If this is a descendant (path starts with old parent path + PATH_SEPARATOR)
    if (item.path.startsWith(`${oldParentPath}${PATH_SEPARATOR}`)) {
      // Get the relative path (everything after the old parent)
      const relativePath = item.path.substring(oldParentPath.length + 1);
      // New path = new parent + relative path
      const newPath = `${newParentPath}${PATH_SEPARATOR}${relativePath}`;
      updates.push({
        id: item.id,
        oldPath: item.path,
        newPath,
      });
    }
  }

  return updates;
}

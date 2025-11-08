/**
 * Path manipulation utilities for folder and item hierarchy
 * These functions work with path strings only - no UI, no Jazz objects
 */

export interface PathUpdateResult {
  newPath: string;
  isValid: boolean;
  error?: string;
}

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

/**
 * Normalizes a name for use in a path (replace spaces with hyphens, preserve case)
 * @example normalizeNameForPath("My Folder") => "My-Folder"
 */
export function normalizeNameForPath(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}

/**
 * Calculate what the new path should be when moving a node
 * Simple: target path + "/" + folder name (or just folder name if no target)
 */
export function calculateNewPath(
  nodeName: string,
  currentPath: string,
  targetParentPath: string | undefined,
): PathUpdateResult {
  // Normalize name (replace spaces with hyphens)
  const normalizedName = nodeName.trim().replace(/\s+/g, '-');

  // New path is simply: target path + name, or just name if at root
  const newPath = targetParentPath ? `${targetParentPath}/${normalizedName}` : normalizedName;

  // Validation: Can't move into itself
  if (targetParentPath === currentPath) {
    return {
      newPath: currentPath,
      isValid: false,
      error: 'Cannot move a folder into itself',
    };
  }

  // Validation: Can't move into descendants
  if (targetParentPath?.startsWith(`${currentPath}/`)) {
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
    // If this is a descendant (path starts with old parent path + "/")
    if (item.path.startsWith(`${oldParentPath}/`)) {
      // Get the relative path (everything after the old parent)
      const relativePath = item.path.substring(oldParentPath.length + 1);
      // New path = new parent + relative path
      const newPath = `${newParentPath}/${relativePath}`;
      updates.push({
        id: item.id,
        oldPath: item.path,
        newPath,
      });
    }
  }

  return updates;
}

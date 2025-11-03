/**
 * Pure path manipulation utilities
 * These functions work with path strings only - no UI, no Jazz objects
 */

export interface PathUpdateResult {
  newPath: string;
  isValid: boolean;
  error?: string;
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

/**
 * Get parent path from a full path
 */
export function getParentPath(fullPath: string): string | undefined {
  const lastSlashIndex = fullPath.lastIndexOf('/');
  return lastSlashIndex > 0 ? fullPath.substring(0, lastSlashIndex) : undefined;
}

/**
 * Get node name from path
 */
export function getNameFromPath(fullPath: string): string {
  const lastSlashIndex = fullPath.lastIndexOf('/');
  return lastSlashIndex >= 0 ? fullPath.substring(lastSlashIndex + 1) : fullPath;
}

/**
 * Normalize a name for use in a path
 */
export function normalizeNameForPath(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}

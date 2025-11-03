/**
 * Path manipulation utilities for folder hierarchy
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

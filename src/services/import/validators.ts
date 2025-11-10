/**
 * Import validation logic
 *
 * Validates imported data before creating CoValues.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account } from '../../schemas';
import type { ExportedData, ExportedFolder } from '../export/types';
import type { ValidationResult } from './types';

const CURRENT_VERSION = '2.0';
const SUPPORTED_VERSIONS = ['1.0', '2.0'];

/**
 * Count items recursively (handles both flat v1.0 and hierarchical v2.0)
 *
 * @param items - Array of items to count
 * @returns Total count of all items and children
 */
function countItemsRecursively(items: unknown[]): number {
  let count = 0;
  for (const item of items) {
    count++; // Count this item
    // If it has children, count them recursively
    if (item && typeof item === 'object' && 'children' in item && Array.isArray(item.children)) {
      count += countItemsRecursively(item.children);
    }
  }
  return count;
}

/**
 * Validate JSON export data
 *
 * @param data - Parsed JSON data
 * @param account - User's account (for conflict detection)
 * @returns Validation result with errors, warnings, and stats
 */
export function validateJsonData(
  data: unknown,
  account: InstanceOfSchema<typeof Account>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalFolders: 0,
    totalItems: 0,
    totalSessions: 0,
    duplicateFolders: 0,
    duplicateItems: 0,
  };

  // Check if data is an object
  if (!data || typeof data !== 'object') {
    errors.push('Invalid JSON: data must be an object');
    return { isValid: false, errors, warnings, stats };
  }

  const exportData = data as Partial<ExportedData>;

  // Validate version
  if (!exportData.version) {
    errors.push('Missing required field: version');
  } else if (!SUPPORTED_VERSIONS.includes(exportData.version)) {
    errors.push(
      `Unsupported version: ${exportData.version}. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
    );
  } else if (exportData.version !== CURRENT_VERSION) {
    warnings.push(
      `Data was exported with version ${exportData.version}, current version is ${CURRENT_VERSION}`,
    );
  }

  // Validate exportDate
  if (!exportData.exportDate) {
    errors.push('Missing required field: exportDate');
  } else if (!isValidISODate(exportData.exportDate)) {
    errors.push(`Invalid exportDate format: ${exportData.exportDate}`);
  }

  // Validate appVersion
  if (!exportData.appVersion) {
    warnings.push('Missing appVersion field');
  }

  // Validate folders array
  if (!exportData.folders) {
    errors.push('Missing required field: folders');
  } else if (!Array.isArray(exportData.folders)) {
    errors.push('Field "folders" must be an array');
  } else {
    // Validate each folder
    for (let i = 0; i < exportData.folders.length; i++) {
      const folder = exportData.folders[i];
      if (!folder) {
        errors.push(`folders[${i}]: Folder is null or undefined`);
        continue;
      }

      const folderErrors = validateFolder(folder, i);
      errors.push(...folderErrors);

      if (folderErrors.length === 0) {
        stats.totalFolders++;

        // Count items and sessions
        if (folder.items) {
          stats.totalItems += countItemsRecursively(folder.items);
        }
        if (folder.sessions) {
          stats.totalSessions += folder.sessions.length;
        }

        // Check for path conflicts in directory
        if (folder.path && directoryPathExists(folder.path, account)) {
          stats.duplicateFolders++;
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Validate a single folder
 *
 * @param folder - Folder to validate
 * @param index - Index in folders array (for error messages)
 * @returns Array of error messages
 */
function validateFolder(folder: Partial<ExportedFolder>, index: number): string[] {
  const errors: string[] = [];
  const prefix = `folders[${index}]`;

  // Required fields
  if (!folder.name) {
    errors.push(`${prefix}: Missing required field "name"`);
  }
  if (!folder.path) {
    errors.push(`${prefix}: Missing required field "path"`);
  }
  if (!folder.type) {
    errors.push(`${prefix}: Missing required field "type"`);
  } else if (folder.type !== 'folder' && folder.type !== 'template-folder') {
    errors.push(`${prefix}: Invalid type "${folder.type}". Must be "folder" or "template-folder"`);
  }
  if (!folder.createdAt) {
    errors.push(`${prefix}: Missing required field "createdAt"`);
  } else if (!isValidISODate(folder.createdAt)) {
    errors.push(`${prefix}: Invalid createdAt format`);
  }
  if (!folder.updatedAt) {
    errors.push(`${prefix}: Missing required field "updatedAt"`);
  } else if (!isValidISODate(folder.updatedAt)) {
    errors.push(`${prefix}: Invalid updatedAt format`);
  }

  // Validate template-folder specific fields
  if (folder.type === 'template-folder') {
    if (folder.items) {
      if (!Array.isArray(folder.items)) {
        errors.push(`${prefix}: Field "items" must be an array`);
      } else {
        // Validate each item
        for (let i = 0; i < folder.items.length; i++) {
          const item = folder.items[i];
          const itemErrors = validateTemplateItem(item, i, prefix);
          errors.push(...itemErrors);
        }
      }
    }

    if (folder.sessions) {
      if (!Array.isArray(folder.sessions)) {
        errors.push(`${prefix}: Field "sessions" must be an array`);
      } else {
        // Validate each session
        for (let i = 0; i < folder.sessions.length; i++) {
          const session = folder.sessions[i];
          const sessionErrors = validateSession(session, i, prefix);
          errors.push(...sessionErrors);
        }
      }
    }
  }

  return errors;
}

/**
 * Validate a template item (supports both v1.0 and v2.0 formats)
 *
 * @param item - Item to validate
 * @param index - Index in items array
 * @param prefix - Error message prefix
 * @returns Array of error messages
 */
function validateTemplateItem(item: unknown, index: number, prefix: string): string[] {
  const errors: string[] = [];
  const itemPrefix = `${prefix}.items[${index}]`;

  if (!item || typeof item !== 'object') {
    errors.push(`${itemPrefix}: Must be an object`);
    return errors;
  }

  const typedItem = item as Record<string, unknown>;

  // Detect format: v2.0 has 'id' or 'children', v1.0 has 'path'
  const isV2Format = 'id' in typedItem || 'children' in typedItem;
  const isV1Format = 'path' in typedItem;

  // Required fields (common to both versions)
  if (!typedItem.name || typeof typedItem.name !== 'string') {
    errors.push(`${itemPrefix}: Missing or invalid "name"`);
  }
  if (!typedItem.type || typeof typedItem.type !== 'string') {
    errors.push(`${itemPrefix}: Missing or invalid "type"`);
  } else if (typedItem.type !== 'category' && typedItem.type !== 'item') {
    errors.push(`${itemPrefix}: Invalid type "${typedItem.type}". Must be "category" or "item"`);
  }

  // Version-specific validation
  if (isV2Format) {
    // V2.0: Requires 'id', optional 'children'
    if (!typedItem.id || typeof typedItem.id !== 'string') {
      errors.push(`${itemPrefix}: Missing or invalid "id" (v2.0 format)`);
    }
    // Validate children if present
    if (typedItem.children) {
      if (!Array.isArray(typedItem.children)) {
        errors.push(`${itemPrefix}: Field "children" must be an array`);
      } else {
        // Recursively validate children
        for (let i = 0; i < typedItem.children.length; i++) {
          const childErrors = validateTemplateItem(
            typedItem.children[i],
            i,
            `${itemPrefix}.children`,
          );
          errors.push(...childErrors);
        }
      }
    }
  } else if (isV1Format) {
    // V1.0: Requires 'path'
    if (!typedItem.path || typeof typedItem.path !== 'string') {
      errors.push(`${itemPrefix}: Missing or invalid "path" (v1.0 format)`);
    }
  } else {
    errors.push(`${itemPrefix}: Unable to determine format version (missing both 'id' and 'path')`);
  }

  if (typeof typedItem.sortOrder !== 'number') {
    errors.push(`${itemPrefix}: Missing or invalid "sortOrder"`);
  }
  if (!typedItem.createdAt || !isValidISODate(typedItem.createdAt as string)) {
    errors.push(`${itemPrefix}: Missing or invalid "createdAt"`);
  }
  if (!typedItem.updatedAt || !isValidISODate(typedItem.updatedAt as string)) {
    errors.push(`${itemPrefix}: Missing or invalid "updatedAt"`);
  }

  return errors;
}

/**
 * Validate a shopping session
 *
 * @param session - Session to validate
 * @param index - Index in sessions array
 * @param prefix - Error message prefix
 * @returns Array of error messages
 */
function validateSession(session: unknown, index: number, prefix: string): string[] {
  const errors: string[] = [];
  const sessionPrefix = `${prefix}.sessions[${index}]`;

  if (!session || typeof session !== 'object') {
    errors.push(`${sessionPrefix}: Must be an object`);
    return errors;
  }

  const typedSession = session as Record<string, unknown>;

  // Required fields
  if (!typedSession.name || typeof typedSession.name !== 'string') {
    errors.push(`${sessionPrefix}: Missing or invalid "name"`);
  }
  if (!typedSession.status || typeof typedSession.status !== 'string') {
    errors.push(`${sessionPrefix}: Missing or invalid "status"`);
  } else if (!['active', 'completed', 'abandoned'].includes(typedSession.status as string)) {
    errors.push(`${sessionPrefix}: Invalid status "${typedSession.status}"`);
  }
  if (!typedSession.itemStates || typeof typedSession.itemStates !== 'object') {
    errors.push(`${sessionPrefix}: Missing or invalid "itemStates"`);
  }
  if (!typedSession.startedAt || !isValidISODate(typedSession.startedAt as string)) {
    errors.push(`${sessionPrefix}: Missing or invalid "startedAt"`);
  }
  if (!typedSession.lastActivityAt || !isValidISODate(typedSession.lastActivityAt as string)) {
    errors.push(`${sessionPrefix}: Missing or invalid "lastActivityAt"`);
  }

  return errors;
}

/**
 * Check if a date string is valid ISO 8601 format
 *
 * @param dateString - Date string to validate
 * @returns true if valid ISO 8601 format
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
}

/**
 * Check if a path already exists in the directory
 *
 * @param path - Path to check
 * @param account - User's account
 * @returns true if path exists in directory
 */
function directoryPathExists(path: string, account: InstanceOfSchema<typeof Account>): boolean {
  if (!account.root?.directory) {
    return false;
  }

  return account.root.directory.some((entry) => entry.path === path && !entry.archived);
}

/**
 * Find a directory entry by path
 *
 * @param path - Path to search for
 * @param account - User's account
 * @returns Directory entry or null if not found
 */
export function findDirectoryEntryByPath(
  path: string,
  account: InstanceOfSchema<typeof Account>,
): import('../../schemas').DirectoryEntry | null {
  if (!account.root?.directory) {
    return null;
  }

  return account.root.directory.find((entry) => entry.path === path && !entry.archived) || null;
}

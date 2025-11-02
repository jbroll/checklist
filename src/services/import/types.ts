/**
 * Type definitions for Import functionality
 *
 * These interfaces define the structure for importing grocery list data.
 */

/**
 * Import result
 *
 * Contains success/failure information and statistics about the import operation.
 */
export interface ImportResult {
  /** Whether the import succeeded */
  success: boolean;
  /** Array of error messages (if any) */
  errors: string[];
  /** Array of warning messages (if any) */
  warnings: string[];
  /** Statistics about what was imported */
  stats: {
    /** Number of folders created */
    foldersCreated?: number;
    /** Number of items added */
    itemsAdded?: number;
    /** Number of items skipped (duplicates) */
    itemsSkipped?: number;
    /** Number of sessions created */
    sessionsCreated?: number;
    /** Number of items matched (for session import) */
    itemsMatched?: number;
  };
  /** Additional data about created entities */
  data?: {
    /** IDs of created folders */
    folderIds?: string[];
    /** ID of created session (for session import) */
    sessionId?: string;
    /** IDs of items that were added */
    addedItemIds?: string[];
  };
}

/**
 * Validation result
 *
 * Contains validation status and details about potential issues.
 */
export interface ValidationResult {
  /** Whether the data is valid */
  isValid: boolean;
  /** Array of error messages that prevent import */
  errors: string[];
  /** Array of warning messages that don't prevent import */
  warnings: string[];
  /** Statistics about the data being validated */
  stats: {
    /** Total number of folders */
    totalFolders?: number;
    /** Total number of items */
    totalItems?: number;
    /** Total number of sessions */
    totalSessions?: number;
    /** Number of folders that would conflict */
    duplicateFolders?: number;
    /** Number of items that would be skipped */
    duplicateItems?: number;
  };
}

/**
 * Session import options
 *
 * Configuration for importing a shopping session from CSV.
 */
export interface SessionImportOptions {
  /** Custom session name (defaults to date-based) */
  sessionName?: string;
  /** Whether to add missing items to template (defaults to false) */
  addMissingItems?: boolean;
}

/**
 * CSV row for template item import
 *
 * Minimal format: just name (category and sortOrder auto-assigned)
 * Full format: includes category and sortOrder
 */
export interface TemplateItemCsvRow {
  name: string;
  category?: string;
  sortOrder?: number;
}

/**
 * CSV row for session import
 *
 * Minimal format: name, inCart, purchased
 * Full format: includes category and timestamps
 */
export interface SessionCsvRow {
  name: string;
  category?: string;
  inCart: boolean;
  purchased: boolean;
  addedToCartAt?: string;
  purchasedAt?: string;
}

/**
 * Import file type
 */
export type ImportFileType = 'json' | 'txt' | 'csv';

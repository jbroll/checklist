/**
 * Type definitions for Export functionality
 *
 * These interfaces define the structure for exporting grocery list data.
 */

import type { Category } from '../../schemas';

/**
 * Main export data structure
 *
 * Contains complete folder structure with all template items and session history.
 */
export interface ExportedData {
  /** Export format version (for future compatibility) */
  version: string;
  /** ISO 8601 timestamp when export was created */
  exportDate: string;
  /** Application version that created the export */
  appVersion: string;
  /** Array of exported folders */
  folders: ExportedFolder[];
}

/**
 * Exported folder structure
 *
 * Represents either an organizational folder or a template folder with items.
 */
export interface ExportedFolder {
  /** Folder display name */
  name: string;
  /** Full path in the tree (e.g., "grocery-stores/wegmans") */
  path: string;
  /** Folder type discriminator */
  type: 'folder' | 'template-folder';
  /** Template items (only for template-folder type) */
  items?: ExportedTemplateItem[];
  /** Shopping sessions (only for template-folder type) */
  sessions?: ExportedSession[];
  /** ID of current active session (only for template-folder type) */
  currentSessionId?: string;
  /** ISO 8601 timestamp when folder was created */
  createdAt: string;
  /** ISO 8601 timestamp when folder was last updated */
  updatedAt: string;
}

/**
 * Exported template item
 *
 * Represents a reusable grocery item in a template folder.
 */
export interface ExportedTemplateItem {
  /** Item name */
  name: string;
  /** Item category */
  category: Category;
  /** Sort order within the template list */
  sortOrder: number;
  /** Default quantity for the item (empty string if not set) */
  defaultQuantity?: string;
  /** ISO 8601 timestamp when item was created */
  createdAt: string;
  /** ISO 8601 timestamp when item was last updated */
  updatedAt: string;
}

/**
 * Exported shopping session
 *
 * Represents a shopping trip with state for each item.
 */
export interface ExportedSession {
  /** Session name (e.g., "[2025-11-01]") */
  name: string;
  /** Session status */
  status: 'active' | 'completed' | 'abandoned';
  /** Map of template item IDs to their shopping state */
  itemStates: Record<string, ExportedItemState>;
  /** ISO 8601 timestamp when session started */
  startedAt: string;
  /** ISO 8601 timestamp of last activity */
  lastActivityAt: string;
  /** ISO 8601 timestamp when session was completed (if completed) */
  completedAt?: string;
}

/**
 * Exported item state
 *
 * Represents the shopping state for one item in a session.
 */
export interface ExportedItemState {
  /** Whether item is in cart */
  inCart: boolean;
  /** Whether item has been purchased */
  purchased: boolean;
  /** ISO 8601 timestamp when added to cart (if in cart) */
  addedToCartAt?: string;
  /** ISO 8601 timestamp when purchased (if purchased) */
  purchasedAt?: string;
}

/**
 * Export scope options
 *
 * Determines what data to export.
 */
export interface ExportScope {
  /** Export type */
  type: 'all-folders' | 'single-folder';
  /** Folder ID (required for single-folder export) */
  folderId?: string;
}

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'txt' | 'csv';

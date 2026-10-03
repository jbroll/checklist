/**
 * Type definitions for Export functionality
 *
 * These interfaces define the structure for exporting list data.
 *
 * Version 2.1: round-trip fidelity — item/session notes, session ids, folder identity + tree
 * (id/parentId/archived/type), per-folder settings, and the user_settings row. Backward
 * compatible: v2.0 exports still import (all v2.1 fields are optional).
 */

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
  /** v2.1: per-user settings backup (merge-on-import; only emitted by full-backup exports) */
  userSettings?: ExportedUserSettings;
}

/**
 * Per-user settings backup. Excludes the subscription cache columns (`subscription_tier` etc.) —
 * those are the backend's source of truth and are refreshed on sync, so restoring them from a
 * backup could show stale limits offline.
 */
export interface ExportedUserSettings {
  defaultAutocompleteDomain: string;
  enableAutoCategorization: boolean;
  viewFolderExpanded: Record<string, boolean>;
  viewTemplateCategoryExpanded: Record<string, Record<string, boolean>>;
  viewSessionCategoryExpanded: Record<string, Record<string, boolean>>;
}

/**
 * Exported folder structure
 *
 * Represents either an organizational folder or a template folder with items.
 */
export interface ExportedFolder {
  /** Folder display name */
  name: string;
  /** Folder type discriminator */
  type: 'folder' | 'template-folder';
  /** v2.1: folder row id — import reuses it when free, remaps only on conflict */
  id?: string;
  /** v2.1: parent folder id (null for roots); import rebuilds the tree when the parent is in the export */
  parentId?: string | null;
  /** v2.1: archived flag (backup policy: archived folders are exported, not skipped) */
  archived?: boolean;
  /** Template items (only for template-folder type) */
  items?: ExportedTemplateItem[];
  /** Shopping sessions (only for template-folder type) */
  sessions?: ExportedSession[];
  /** ID of current active session (only for template-folder type) — removed from the schema, kept declared for compat, never emitted */
  currentSessionId?: string;
  /** v2.1: per-folder default-items map (keys are item ids, remapped on import) */
  defaultItems?: Record<string, boolean>;
  /** v2.1: per-folder settings */
  showZoneHeadings?: boolean;
  autocompleteDomain?: string;
  autoCategorizeEnabled?: boolean;
  /** ISO 8601 timestamp when folder was created */
  createdAt: string;
  /** ISO 8601 timestamp when folder was last updated */
  updatedAt: string;
}

/**
 * Exported template item (v2.1 - hierarchical structure)
 *
 * Represents a reusable item or category in a template folder.
 * Uses nested children instead of flat paths for more compact representation.
 */
export interface ExportedTemplateItem {
  /** Unique item ID (required for session state references) */
  id: string;
  /** Item name */
  name: string;
  /** Item type: 'category' (folder) or 'item' (leaf) */
  type: 'category' | 'item';
  /** Child items (categories only) - hierarchical nesting */
  children?: ExportedTemplateItem[];
  /** Whether the category is expanded in the UI (categories only) */
  expanded?: boolean;
  /** Sort order within parent */
  sortOrder: number;
  /** Default quantity for the item (items only) */
  defaultQuantity?: string;
  /** v2.1: item notes */
  notes?: string;
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
  /** v2.1: session row id — import reuses it when free, remaps only on conflict */
  id?: string;
  /** Session name (generated from createdAt, e.g., "2025-11-01" or "2025-11-01 14:30") */
  name: string;
  /** Soft delete flag - archived sessions are hidden by default */
  archived: boolean;
  /** View mode for displaying items */
  viewMode: 'zone-in-hierarchy' | 'flat';
  /** v2.1: per-category expanded state */
  categoryExpanded?: Record<string, boolean>;
  /** Map of template item IDs to their shopping state */
  itemStates: Record<string, ExportedItemState>;
  /** ISO 8601 timestamp when session was created */
  createdAt: string;
  /** ISO 8601 timestamp of last activity */
  lastActivityAt: string;
}

/**
 * Exported item state (v2.1 - neutral terminology)
 *
 * Represents the session state for one item.
 * Uses neutral terminology (selected/checked) instead of shopping-specific terms.
 */
export interface ExportedItemState {
  /** Whether item is selected (left checkbox) */
  selected: boolean;
  /** Whether item is checked (right checkbox) */
  checked: boolean;
  /** ISO 8601 timestamp when selected */
  selectedAt?: string;
  /** ISO 8601 timestamp when checked */
  checkedAt?: string;
  /** v2.1: per-state notes */
  notes?: string;
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

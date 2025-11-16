import { co, z } from 'jazz-tools';

// Forward reference to Account (defined in index.ts)
// Use getter pattern for forward references
// biome-ignore lint/suspicious/noExplicitAny: Forward reference pattern requires any
let Account: any;

// Helper to set the account reference (called from index.ts)
// biome-ignore lint/suspicious/noExplicitAny: This accepts any account schema type
export function setAccountReference(account: any) {
  Account = account;
}

/**
 * TemplateItem - Plain JSON object (not a CoValue)
 * Represents a hierarchical category or item node within a template.
 */
export type TemplateItem = {
  id: string;
  name: string;
  type: 'category' | 'item';
  path: string; // Hierarchical path using \x01 separator (ASCII SOH)
  expanded: boolean; // For category nodes - UI state
  sortOrder: number;
  archived: boolean; // Soft delete flag
  defaultQuantity: string; // Default quantity for items
  createdAt: Date;
};

/**
 * ItemState - Plain JSON object (not a CoValue)
 * Tracks session state for a specific item.
 */
export type ItemState = {
  selected: boolean; // Left checkbox - item selected
  checked: boolean; // Right checkbox - item marked as checked
  selectedAt?: Date;
  checkedAt?: Date;
};

/**
 * Session - Single CoValue tracking state for a shopping/list session
 * Sessions are owned by templates and have no back-reference.
 * Display name is generated from createdAt timestamp.
 */
export const Session = co.map({
  // Item states as plain JSON record (itemId → state)
  itemStates: z.record(
    z.string(),
    z.object({
      selected: z.boolean(),
      checked: z.boolean(),
      selectedAt: z.optional(z.date()),
      checkedAt: z.optional(z.date()),
    }),
  ),

  archived: z.boolean(), // Soft delete flag

  // UI state - which categories are expanded (by path or ID)
  categoryExpanded: z.record(z.string(), z.boolean()),

  // UI state - view mode preference
  viewMode: z.enum(['zone-in-hierarchy', 'flat']),

  // Cached counts for UI performance
  selectedCount: z.number(),
  checkedCount: z.number(),
  remainingCount: z.number(),

  // Ownership and timestamps
  get owner() {
    return Account;
  },
  createdAt: z.date(),
  lastActivityAt: z.date(),
});

/**
 * FolderNode - Hierarchical folder/template CoValue
 *
 * Represents both organizational folders and template folders.
 * Uses optional fields instead of discriminated unions (Jazz limitation).
 *
 * For organizational folders:
 *   - name, expanded, archived, createdAt, updatedAt are set
 *   - children contains nested FolderNodes
 *   - parent points to parent folder (if not root)
 *
 * For template folders:
 *   - name, expanded, archived, createdAt, updatedAt are set
 *   - items contains template items (plain JSON array)
 *   - sessions contains shopping sessions
 *   - showZoneHeadings controls UI display
 *   - parent points to parent folder (if not root)
 */
// biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x requires any for recursive types with forward references
export const FolderNode: any = co.map({
  name: z.string(),
  expanded: z.boolean(),
  archived: z.boolean(),

  // Optional fields - use as required for different types

  // For organizational folders: nested child folders
  get children() {
    return co.optional(co.list(FolderNode));
  },

  // For template folders: template data
  items: z.optional(
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(['category', 'item']),
        path: z.string(),
        expanded: z.boolean(),
        sortOrder: z.number(),
        archived: z.boolean(),
        defaultQuantity: z.string(),
        createdAt: z.date(),
      }),
    ),
  ),
  sessions: co.optional(co.list(Session)),
  showZoneHeadings: z.optional(z.boolean()),

  // Parent back-reference for breadcrumbs and path computation
  get parent() {
    return co.optional(FolderNode);
  },

  // Ownership and timestamps
  get owner() {
    return Account;
  },
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Template - The actual template data (DEPRECATED - kept for migration)
 * Use FolderNode with template fields instead
 */
export const Template = co.map({
  name: z.string(),

  // Items as plain JSON array (not CoValues)
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['category', 'item']),
      path: z.string(),
      expanded: z.boolean(),
      sortOrder: z.number(),
      archived: z.boolean(),
      defaultQuantity: z.string(),
      createdAt: z.date(),
    }),
  ),

  // Sessions as CoList
  sessions: co.list(Session),
  currentSessionId: z.optional(z.string()), // Active session ID if any

  // Template-specific settings
  showZoneHeadings: z.boolean(),

  // Ownership and timestamps
  get owner() {
    return Account;
  },
  createdAt: z.date(),
  updatedAt: z.date(),
});

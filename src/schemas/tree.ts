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
 * DirectoryEntry - Lightweight directory entry (like filesystem dentry)
 * Points to either a folder or a template "inode"
 */
export type DirectoryEntry = {
  id: string; // Unique entry ID
  name: string;
  type: 'folder' | 'template-ref';
  path: string; // Hierarchical path
  expanded: boolean;
  archived: boolean;
  templateId?: string; // For template-ref: ID of Template "inode"
  createdAt: Date;
  updatedAt: Date;
};

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
  viewMode: z.enum(['zone-in-hierarchy', 'hierarchy-in-zones', 'flat']),

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
 * Template - The actual template data (loaded on-demand like an inode)
 * Directory entries point to these by ID
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

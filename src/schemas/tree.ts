import { co, z } from 'jazz-tools';

// Forward reference to GroceriesAccount (defined in index.ts)
// Use getter pattern for forward references
// biome-ignore lint/suspicious/noExplicitAny: Forward reference pattern requires any
let GroceriesAccount: any;

// Helper to set the account reference (called from index.ts)
// biome-ignore lint/suspicious/noExplicitAny: This accepts any account schema type
export function setGroceriesAccountReference(account: any) {
  GroceriesAccount = account;
}

/**
 * TemplateItem - Hierarchical category or item node
 *
 * Templates now support hierarchical organization using path-based structure.
 * Categories are just TemplateItems with type='category'.
 * Shopping state is tracked separately in ShoppingSession.
 *
 * Examples:
 * - { type: 'category', path: 'produce', name: 'Produce' }
 * - { type: 'category', path: 'produce/fruits', name: 'Fruits' }
 * - { type: 'item', path: 'produce/fruits/apples', name: 'Apples' }
 */
export const TemplateItem = co.map({
  name: z.string(),
  type: z.enum(['category', 'item']), // category = folder node, item = leaf node
  path: z.string(), // Hierarchical path like FolderNode: "produce/fruits/apples"
  expanded: z.boolean(), // For category nodes - UI state
  sortOrder: z.number(),
  archived: z.boolean(), // Soft delete flag - never hard delete items

  // Item-specific fields (empty/ignored for categories)
  defaultQuantity: z.string(), // Default quantity for the item

  // Optional customization per template
  color: z.string(), // Hex color for UI

  // References
  get addedBy() {
    return GroceriesAccount;
  },

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * ItemState - Shopping session state for a template item
 * Tracks the shopping state (in cart, purchased) for a specific item in a session.
 * References the template item by ID.
 */
export const ItemState = co.map({
  itemId: z.string(), // Reference to TemplateItem.$jazz.id

  // Shopping state - dual checkbox system
  inCart: z.boolean(), // Left checkbox - item added to cart
  purchased: z.boolean(), // Right checkbox - item marked as purchased

  // Timestamps for state changes (Unix seconds)
  addedToCartAt: z.optional(z.number()),
  purchasedAt: z.optional(z.number()),

  // Track who checked the item
  get checkedBy() {
    return co.optional(GroceriesAccount);
  },
});

/**
 * ShoppingSession - Tracks state for a shopping trip
 * Sessions reference template items and track their state.
 * Name format: "[2025-01-15]" or "[2025-01-15 14:30]" if multiple sessions per day.
 */
export const ShoppingSession = co.map({
  name: z.string(), // Date-prefixed: "[2025-01-15]" or "[2025-01-15 14:30]"
  templateFolderId: z.string(), // Reference to parent TemplateFolderNode.$jazz.id

  // State tracking by item ID
  // Maps itemId → ItemState
  itemStates: co.record(z.string(), ItemState),

  // Session status
  status: z.enum(['active', 'completed', 'abandoned']),
  archived: z.boolean(), // Soft delete flag - never hard delete sessions

  // UI state - which categories are expanded (by path or ID)
  categoryExpanded: co.record(z.string(), z.boolean()),

  // UI state - view mode preference
  // - 'zone-in-hierarchy': Shows category hierarchy with zones nested inside
  // - 'hierarchy-in-zones': Shows zones with category hierarchy inside each zone
  // - 'flat': Simple list grouped by zone only
  viewMode: z.enum(['zone-in-hierarchy', 'hierarchy-in-zones', 'flat']),

  // Cached counts for UI performance
  inCartCount: z.number(),
  completedCount: z.number(),
  remainingCount: z.number(),

  // Ownership and timestamps
  get owner() {
    return GroceriesAccount;
  },
  startedAt: z.number(), // Unix timestamp in seconds
  lastActivityAt: z.number(), // Unix timestamp in seconds
  completedAt: z.optional(z.number()), // Unix timestamp in seconds
});

/**
 * TemplateFolderNode - Leaf node containing template items and sessions
 * Template folders are the leaf nodes in the tree - they cannot have children.
 * They contain the master list of items and track shopping sessions.
 */
export const TemplateFolderNode = co.map({
  name: z.string(),
  type: z.literal('template-folder'),
  path: z.string(), // e.g., "grocery-stores/wegmans/weekly-groceries"
  expanded: z.boolean(),

  // Template items (master list)
  items: co.list(TemplateItem),

  // Shopping sessions
  sessions: co.list(ShoppingSession),
  currentSessionId: z.optional(z.string()), // Active session ID if any

  // Sharing (to be implemented in Phase 6)
  // permissions: PathPermissions,
  // sharingMode: z.optional(z.enum(['private', 'shared', 'public'])),

  // Ownership and timestamps
  get owner() {
    return GroceriesAccount;
  },
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * FolderNode - Organizational folder OR template folder (discriminated union)
 *
 * Two types:
 * - "folder" - Organizational folder (can have children, no items)
 * - "template-folder" - Template folder (leaf node, has items and sessions)
 *
 * This is a discriminated union based on the "type" field.
 */
export const FolderNode = co.map({
  name: z.string(),
  type: z.enum(['folder', 'template-folder']),
  path: z.string(), // e.g., "grocery-stores" or "grocery-stores/wegmans"
  expanded: z.boolean(),
  archived: z.boolean(), // Soft delete flag

  // Template-folder configuration
  showZoneHeadings: z.boolean().default(false), // Controls zone heading visibility in session view

  // For organizational folders only
  // Children are implicit via path hierarchy

  // For template-folders only (these will be empty arrays for type="folder")
  // Note: Using non-optional CoLists with empty arrays avoids TypeScript inference issues
  items: co.list(TemplateItem),
  sessions: co.list(ShoppingSession),
  currentSessionId: z.string(), // Empty string if no current session

  // Sharing (to be implemented in Phase 6)
  // permissions: PathPermissions,
  // sharingMode: z.optional(z.enum(['private', 'shared', 'public'])),

  // Ownership and timestamps
  get owner() {
    return GroceriesAccount;
  },
  createdAt: z.date(),
  updatedAt: z.date(),
});

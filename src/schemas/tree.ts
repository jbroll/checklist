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
 * TemplateItem - Clean grocery item without shopping state
 * These are reusable template items that live in a template folder.
 * Shopping state is tracked separately in ShoppingSession.
 */
export const TemplateItem = co.map({
  name: z.string(),
  category: z.literal([
    'produce',
    'dairy',
    'meat',
    'pantry',
    'frozen',
    'household',
    'bakery',
    'beverages',
    'other',
  ] as const),
  sortOrder: z.number(),
  archived: z.boolean(), // Soft delete flag - never hard delete items
  defaultQuantity: z.string(), // Default quantity for the item

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

  // Timestamps for state changes
  addedToCartAt: z.optional(z.date()),
  purchasedAt: z.optional(z.date()),

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

  // UI state - which categories are expanded
  categoryExpanded: co.record(z.string(), z.boolean()),

  // Cached counts for UI performance
  inCartCount: z.number(),
  completedCount: z.number(),
  remainingCount: z.number(),

  // Ownership and timestamps
  get owner() {
    return GroceriesAccount;
  },
  startedAt: z.date(),
  lastActivityAt: z.date(),
  completedAt: z.optional(z.date()),
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

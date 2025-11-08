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
 * TemplateItem - Hierarchical category or item node
 *
 * Templates now support hierarchical organization using path-based structure.
 * Categories are just TemplateItems with type='category'.
 * Item state is tracked separately in ListSession.
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
    return Account;
  },

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * ItemState - List session state for a template item
 * Tracks the item state (selected, checked) for a specific item in a session.
 * References the template item by ID.
 */
export const ItemState = co.map({
  itemId: z.string(), // Reference to TemplateItem.$jazz.id

  // Item state - dual checkbox system
  selected: z.boolean(), // Left checkbox - item selected
  checked: z.boolean(), // Right checkbox - item marked as checked

  // Timestamps for state changes
  selectedAt: z.optional(z.date()),
  checkedAt: z.optional(z.date()),

  // Track who checked the item
  get checkedBy() {
    return co.optional(Account);
  },
});

/**
 * ListSession - Tracks state for a list session
 * Sessions reference template items and track their state.
 * Name format: "[2025-01-15]" or "[2025-01-15 14:30]" if multiple sessions per day.
 */
export const ListSession = co
  .map({
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
    selectedCount: z.number(),
    checkedCount: z.number(),
    remainingCount: z.number(),

    // Ownership and timestamps
    get owner() {
      return Account;
    },
    startedAt: z.date(),
    lastActivityAt: z.date(),
    completedAt: z.optional(z.date()),
  })
  .withMigration((session) => {
    // Migrate old shopping terminology to generic list terminology

    // Migrate item states
    if (session.$jazz.has('itemStates')) {
      const itemStates = session.itemStates;
      if (itemStates) {
        Object.entries(itemStates).forEach(([, state]) => {
          if (!state) return;

          // Migrate inCart → selected
          // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
          if ((state.$jazz as any).has('inCart') && !state.$jazz.has('selected')) {
            // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
            const inCart = (state as any).inCart;
            state.$jazz.set('selected', inCart);
          }

          // Migrate purchased → checked
          // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
          if ((state.$jazz as any).has('purchased') && !state.$jazz.has('checked')) {
            // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
            const purchased = (state as any).purchased;
            state.$jazz.set('checked', purchased);
          }

          // Migrate addedToCartAt → selectedAt
          // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
          if ((state.$jazz as any).has('addedToCartAt') && !state.$jazz.has('selectedAt')) {
            // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
            const addedToCartAt = (state as any).addedToCartAt;
            state.$jazz.set('selectedAt', addedToCartAt);
          }

          // Migrate purchasedAt → checkedAt
          // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
          if ((state.$jazz as any).has('purchasedAt') && !state.$jazz.has('checkedAt')) {
            // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
            const purchasedAt = (state as any).purchasedAt;
            state.$jazz.set('checkedAt', purchasedAt);
          }
        });
      }
    }

    // Migrate count fields
    // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
    if ((session.$jazz as any).has('inCartCount') && !session.$jazz.has('selectedCount')) {
      // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
      session.$jazz.set('selectedCount', (session as any).inCartCount);
    }

    // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
    if ((session.$jazz as any).has('completedCount') && !session.$jazz.has('checkedCount')) {
      // biome-ignore lint/suspicious/noExplicitAny: Migration code accessing old field names
      session.$jazz.set('checkedCount', (session as any).completedCount);
    }
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

  // List sessions
  sessions: co.list(ListSession),
  currentSessionId: z.optional(z.string()), // Active session ID if any

  // Sharing (to be implemented in Phase 6)
  // permissions: PathPermissions,
  // sharingMode: z.optional(z.enum(['private', 'shared', 'public'])),

  // Ownership and timestamps
  get owner() {
    return Account;
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
  showZoneHeadings: z.optional(z.boolean()), // Controls zone heading visibility in session view

  // For organizational folders only
  // Children are implicit via path hierarchy

  // For template-folders only (these will be empty arrays for type="folder")
  // Note: Using non-optional CoLists with empty arrays avoids TypeScript inference issues
  items: co.list(TemplateItem),
  sessions: co.list(ListSession),
  currentSessionId: z.string(), // Empty string if no current session

  // Sharing (to be implemented in Phase 6)
  // permissions: PathPermissions,
  // sharingMode: z.optional(z.enum(['private', 'shared', 'public'])),

  // Ownership and timestamps
  get owner() {
    return Account;
  },
  createdAt: z.date(),
  updatedAt: z.date(),
});

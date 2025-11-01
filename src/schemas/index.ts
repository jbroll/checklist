import { co, z } from 'jazz-tools';
import {
  FolderNode,
  ItemState,
  ShoppingSession,
  setGroceriesAccountReference,
  TemplateFolderNode,
  TemplateItem,
} from './tree';

// Category type definition
export type Category =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'pantry'
  | 'frozen'
  | 'household'
  | 'bakery'
  | 'beverages'
  | 'other';

// Grocery Item Schema
export const GroceryItem = co.map({
  name: z.string(),
  quantity: z.optional(z.string()),
  notes: z.optional(z.string()),
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
  checked: z.boolean(),
  archived: z.boolean(),
  get addedBy() {
    return GroceriesAccount;
  },
  get checkedBy() {
    return co.optional(GroceriesAccount);
  },
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Grocery List Schema
export const GroceryList = co.map({
  name: z.string(),
  items: co.list(GroceryItem),
  get owner() {
    return GroceriesAccount;
  },
  archived: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Root Schema for user's lists
// New structure: flat list of folder nodes (both organizational and template folders)
export const ListsRoot = co.map({
  nodes: co.list(FolderNode),
  // Keep old lists for migration (will be removed after migration completes)
  myLists: co.optional(co.list(GroceryList)),
  sharedLists: co.optional(co.list(GroceryList)),
});

// Account Schema (must be defined after ListsRoot)
export const GroceriesAccount = co
  .account({
    root: ListsRoot,
    profile: co.profile(),
  })
  .withMigration((account) => {
    console.log('🔧 Migration running for account:', account.$jazz.id);
    console.log('Has root?', account.$jazz.has('root'));
    console.log('Current root value:', account.root);

    // Initialize root for new accounts
    // Using has() to check if root has EVER been set (even if currently null)
    if (!account.$jazz.has('root')) {
      console.log('Creating new root...');
      try {
        // Set root using plain object literal - Jazz will convert to CoMap
        // New structure with nodes array
        account.$jazz.set('root', {
          nodes: [],
        });
        console.log('Root set successfully with new schema');
      } catch (error) {
        console.error('Error setting root:', error);
      }
    } else {
      console.log('Root already exists');
      // TODO: Migration from old schema (myLists/sharedLists) to new schema (nodes)
      // Will be implemented when we have data to migrate
    }
  });

// Wire up the forward reference from tree.ts to GroceriesAccount
setGroceriesAccountReference(GroceriesAccount);

// Default categories with display information
export const CATEGORIES: Record<Category, { name: string; icon: string; color: string }> = {
  produce: { name: 'Produce', icon: '🥬', color: '#22c55e' },
  dairy: { name: 'Dairy', icon: '🥛', color: '#3b82f6' },
  meat: { name: 'Meat', icon: '🥩', color: '#ef4444' },
  pantry: { name: 'Pantry', icon: '🥫', color: '#f59e0b' },
  frozen: { name: 'Frozen', icon: '❄️', color: '#06b6d4' },
  household: { name: 'Household', icon: '🧴', color: '#8b5cf6' },
  bakery: { name: 'Bakery', icon: '🥖', color: '#d97706' },
  beverages: { name: 'Beverages', icon: '🥤', color: '#ec4899' },
  other: { name: 'Other', icon: '📦', color: '#6b7280' },
};

// Helper function to auto-categorize items based on name
export function autoCategorize(itemName: string): Category {
  const name = itemName.toLowerCase();

  // Check more specific categories first to avoid false matches

  // Frozen keywords (check before dairy/meat to catch "ice cream", "frozen chicken")
  if (/\b(frozen|ice cream|popsicles?)\b/.test(name)) {
    return 'frozen';
  }

  // Beverages keywords (check before produce to catch "orange juice")
  // Using \b at start but not end to allow plurals and compound words
  if (/\b(coffee|tea|soda|juices?|water|beer|wine|drinks?|beverages?)\b/.test(name)) {
    return 'beverages';
  }

  // Pantry keywords (check before produce to catch "tomato sauce")
  if (/\b(rice|pastas?|cereals?|flour|sugar|salt|oils?|sauces?|cans?|canned)\b/.test(name)) {
    return 'pantry';
  }

  // Bakery keywords
  if (/\b(breads?|bagels?|muffins?|cakes?|cookies?|pastr(?:y|ies))\b/.test(name)) {
    return 'bakery';
  }

  // Household keywords
  if (/\b(soaps?|detergents?|cleaners?|papers?|toilet|towels?|trash|bags?)\b/.test(name)) {
    return 'household';
  }

  // Produce keywords
  if (
    /\b(apples?|bananas?|oranges?|lettuce|tomatoes?|carrots?|onions?|potatoes?|fruits?|vegetables?)\b/.test(
      name,
    )
  ) {
    return 'produce';
  }

  // Dairy keywords (check after frozen to avoid "ice cream" false match)
  if (/\b(milk|cheeses?|yogurts?|butter|creams?|dairy)\b/.test(name)) {
    return 'dairy';
  }

  // Meat keywords (check after frozen to avoid "frozen chicken" false match)
  if (/\b(chickens?|beef|pork|fish|meats?|turkeys?|steaks?|bacon)\b/.test(name)) {
    return 'meat';
  }

  return 'other';
}

// Re-export tree schemas for easy importing
export { FolderNode, TemplateFolderNode, TemplateItem, ShoppingSession, ItemState };

import { co, z } from 'jazz-tools';

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
  category: z
    .literal([
      'produce',
      'dairy',
      'meat',
      'pantry',
      'frozen',
      'household',
      'bakery',
      'beverages',
      'other',
    ] as const)
    .default('other'),
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
export const ListsRoot = co.map({
  myLists: co.list(GroceryList),
  sharedLists: co.list(GroceryList),
});

// Account Schema (must be defined after ListsRoot)
export const GroceriesAccount = co.account({
  root: ListsRoot,
  profile: co.profile(),
});

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

  // Produce keywords
  if (/apple|banana|orange|lettuce|tomato|carrot|onion|potato|fruit|vegetable/.test(name)) {
    return 'produce';
  }

  // Dairy keywords
  if (/milk|cheese|yogurt|butter|cream|dairy/.test(name)) {
    return 'dairy';
  }

  // Meat keywords
  if (/chicken|beef|pork|fish|meat|turkey|steak|bacon/.test(name)) {
    return 'meat';
  }

  // Frozen keywords
  if (/frozen|ice cream|popsicle/.test(name)) {
    return 'frozen';
  }

  // Bakery keywords
  if (/bread|bagel|muffin|cake|cookie|pastry/.test(name)) {
    return 'bakery';
  }

  // Beverages keywords
  if (/coffee|tea|soda|juice|water|beer|wine|drink|beverage/.test(name)) {
    return 'beverages';
  }

  // Household keywords
  if (/soap|detergent|cleaner|paper|toilet|towel|trash|bag/.test(name)) {
    return 'household';
  }

  // Pantry keywords (default for common items)
  if (/rice|pasta|cereal|flour|sugar|salt|oil|sauce|can/.test(name)) {
    return 'pantry';
  }

  return 'other';
}

#!/usr/bin/env node
/**
 * Generate grocery.json from USDA data
 *
 * Usage: node generate-dictionary.cjs
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Load category mapping
const categoryMapping = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config/category-mapping.json'), 'utf8')
);

// USDA SR Legacy category -> store aisle mapping
const SR_LEGACY_TO_STORE = {
  'Dairy and Egg Products': { default: 'dairy', keywords: { 'egg': 'dairy' } },
  'Spices and Herbs': { default: 'condiments' },
  'Baby Foods': { default: 'baby' },
  'Fats and Oils': { default: 'condiments' },
  'Poultry Products': { default: 'meat' },
  'Soups, Sauces, and Gravies': { default: 'condiments', keywords: { 'soup': 'canned' } },
  'Sausages and Luncheon Meats': { default: 'meat', keywords: { 'deli': 'deli' } },
  'Breakfast Cereals': { default: 'breakfast' },
  'Fruits and Fruit Juices': { default: 'produce', keywords: { 'juice': 'beverages', 'frozen': 'frozen', 'canned': 'canned', 'dried': 'snacks' } },
  'Pork Products': { default: 'meat' },
  'Vegetables and Vegetable Products': { default: 'produce', keywords: { 'frozen': 'frozen', 'canned': 'canned' } },
  'Nut and Seed Products': { default: 'snacks' },
  'Beef Products': { default: 'meat' },
  'Beverages': { default: 'beverages' },
  'Finfish and Shellfish Products': { default: 'seafood' },
  'Legumes and Legume Products': { default: 'canned', keywords: { 'raw': 'produce' } },
  'Lamb, Veal, and Game Products': { default: 'meat' },
  'Baked Products': { default: 'bakery' },
  'Sweets': { default: 'snacks', keywords: { 'sugar': 'baking', 'syrup': 'baking', 'honey': 'baking' } },
  'Cereal Grains and Pasta': { default: 'pasta' },
  'Fast Foods': null, // Skip
  'Meals, Entrees, and Side Dishes': { default: 'frozen' },
  'Snacks': { default: 'snacks' },
  'American Indian/Alaska Native Foods': null, // Skip
  'Restaurant Foods': null, // Skip
};

// Category overrides for specific items (item name -> category)
const CATEGORY_OVERRIDES = {
  'ketchup': 'condiments',
  'catsup': 'condiments',
  'mustard': 'condiments',
  'mayonnaise': 'condiments',
  'salsa': 'condiments',
  'hot sauce': 'condiments',
  'soy sauce': 'condiments',
  'worcestershire sauce': 'condiments',
  'barbecue sauce': 'condiments',
  'tartar sauce': 'condiments',
  'horseradish': 'condiments',
  'relish': 'condiments',
  'pickle': 'condiments',
  'pickles': 'condiments',
};

// Words that indicate the USDA "Category, type" pattern should be reversed
const CATEGORY_PREFIXES = [
  'cheese', 'milk', 'bread', 'soup', 'sauce', 'juice', 'oil', 'vinegar',
  'butter', 'cream', 'yogurt', 'beef', 'pork', 'chicken', 'turkey', 'lamb',
  'fish', 'rice', 'pasta', 'beans', 'crackers', 'cookies', 'cake', 'pie',
  'pudding', 'ice cream', 'candy', 'chocolate', 'nuts', 'seeds',
];

// Items to skip entirely (brand names, too specific, etc.)
const SKIP_PATTERNS = [
  /^pillsbury/i,
  /^nabisco/i,
  /^kellogg/i,
  /^general mills/i,
  /^kraft/i,
  /^oscar mayer/i,
  /^archway/i,
  /^andrea's/i,
  /^clif/i,
  /^campbell/i,
  /^tyson/i,
  /^dole/i,
  /^heinz/i,
  /^del monte/i,
  /^hormel/i,
  /['']s$/,  // possessives like "wendy's"
];

// Subcategory keywords
const SUBCATEGORY_KEYWORDS = {
  produce: {
    fruits: ['apple', 'banana', 'orange', 'grape', 'berry', 'melon', 'mango', 'pear', 'peach', 'plum', 'cherry', 'lemon', 'lime', 'grapefruit', 'kiwi', 'pineapple', 'papaya', 'avocado', 'coconut', 'fig', 'date', 'pomegranate', 'passion', 'guava', 'tangerine', 'clementine', 'apricot', 'nectarine', 'cantaloupe', 'honeydew', 'watermelon', 'strawberr', 'blueberr', 'blackberr', 'raspberr', 'cranberr'],
    vegetables: ['carrot', 'broccoli', 'potato', 'tomato', 'onion', 'pepper', 'lettuce', 'spinach', 'cabbage', 'celery', 'cucumber', 'zucchini', 'squash', 'corn', 'pea', 'bean', 'asparagus', 'cauliflower', 'eggplant', 'mushroom', 'garlic', 'ginger', 'beet', 'turnip', 'radish', 'artichoke', 'leek', 'kale', 'chard', 'collard', 'brussels', 'sweet potato', 'yam'],
    herbs: ['basil', 'cilantro', 'parsley', 'mint', 'rosemary', 'thyme', 'oregano', 'dill', 'chive', 'sage', 'tarragon'],
  },
  meat: {
    beef: ['beef', 'steak', 'ground beef', 'roast', 'brisket', 'ribeye', 'sirloin', 'filet', 'chuck'],
    pork: ['pork', 'bacon', 'ham', 'sausage', 'pork chop', 'tenderloin', 'ribs'],
    poultry: ['chicken', 'turkey', 'duck', 'goose', 'cornish'],
    lamb: ['lamb', 'mutton'],
  },
  dairy: {
    milk: ['milk', 'cream', 'half and half', 'buttermilk'],
    cheese: ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'swiss', 'brie', 'gouda', 'feta', 'ricotta', 'cottage'],
    yogurt: ['yogurt', 'yoghurt', 'kefir'],
    eggs: ['egg'],
    butter: ['butter', 'margarine', 'spread'],
  },
  seafood: {
    fish: ['salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'bass', 'catfish', 'snapper', 'mahi', 'swordfish', 'flounder', 'sole', 'sardine', 'anchov', 'mackerel', 'herring'],
    shellfish: ['shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'crawfish', 'crayfish'],
  },
};

/**
 * Normalize a food description to a simpler name
 */
function normalizeName(description) {
  let name = description.toLowerCase();

  // Remove common suffixes
  const suffixPatterns = [
    /,\s*raw$/,
    /,\s*(cooked|roasted|baked|fried|grilled|steamed|boiled|broiled|braised|sauteed|microwaved).*$/,
    /,\s*meat only.*$/,
    /,\s*flesh only.*$/,
    /,\s*without skin.*$/,
    /,\s*with skin.*$/,
    /,\s*with peel.*$/,
    /,\s*peeled.*$/,
    /,\s*skin only.*$/,
    /,\s*peel only.*$/,
    /,\s*(fresh|frozen|canned|dried)$/,
    /,\s*unprepared$/,
    /,\s*prepared$/,
    /,\s*drained.*$/,
    /,\s*solids and liquids.*$/,
    /,\s*all varieties.*$/,
    /,\s*all types.*$/,
    /,\s*ns as to.*$/,
    /,\s*nfs$/,
    /,\s*plain$/,
    /,\s*regular$/,
    /,\s*commercial.*$/,
    /,\s*homemade.*$/,
    /,\s*store-?bought.*$/,
    /,\s*bottled.*$/,
    /,\s*unsweetened.*$/,
  ];

  for (const pattern of suffixPatterns) {
    name = name.replace(pattern, '');
  }

  // Remove parenthetical notes
  name = name.replace(/\s*\([^)]+\)\s*/g, ' ');

  // Clean up whitespace
  name = name.replace(/\s+/g, ' ').trim();

  // Handle "Category, type" pattern -> "type category"
  // e.g., "Cheese, cheddar" -> "cheddar cheese"
  const parts = name.split(',').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length >= 2) {
    const first = parts[0];
    const second = parts[1];

    // If second part already contains the first (buttermilk contains milk), just use second
    if (second.includes(first)) {
      name = second;
    } else if (CATEGORY_PREFIXES.includes(first)) {
      // Check if first part is a category word that should be reversed
      // "cheese, cheddar" -> "cheddar cheese"
      name = `${second} ${first}`;
    } else if (parts.length === 2 && second.length < 20) {
      // For short second parts, just combine: "bread, banana" -> "banana bread"
      // But check if second part is a descriptor that should come first
      const descriptorWords = ['whole', 'white', 'brown', 'skim', 'low', 'reduced', 'fat', 'free', 'light'];
      if (!descriptorWords.some(w => second.startsWith(w))) {
        name = `${second} ${first}`;
      } else {
        name = `${first} ${second}`;
      }
    } else {
      // Just take first part for complex descriptions
      name = first;
    }
  }

  // Clean up again
  name = name.replace(/\s+/g, ' ').trim();

  // Remove trailing punctuation
  name = name.replace(/[,;:.]+$/, '').trim();

  return name;
}

/**
 * Check if item should be skipped
 */
function shouldSkip(name) {
  return SKIP_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Get canonical form for deduplication (singular, lowercase)
 * Returns both canonical form and the proper singular display name
 */
function getCanonical(name) {
  let canonical = name.toLowerCase().trim();
  let singular = canonical;

  // Words that should NOT be singularized (already singular or special cases)
  const noSingularize = [
    'asparagus', 'broccoli', 'hummus', 'couscous', 'molasses', 'lettuce',
    'rice', 'juice', 'sauce', 'cheese', 'produce', 'lettuce', 'cabbage',
    'sausage', 'porridge', 'fudge', 'mousse', 'grits', 'oats', 'lentils',
    'spinach', 'squash', 'bass', 'swiss', 'grass', 'floss', 'moss',
    'hummus', 'tahini', 'tofu', 'tempeh', 'seitan', 'miso', 'edamame',
    'brussels', 'grapes', // keep as plural - more natural
  ];

  // Words ending in "leaves" or "greens" should stay plural
  if (canonical.endsWith(' leaves') || canonical.endsWith(' greens')) {
    return { canonical, singular };
  }

  if (noSingularize.includes(canonical)) {
    return { canonical, singular };
  }

  // Convert to singular - be more careful
  if (canonical.endsWith('ies') && canonical.length > 5) {
    // berries -> berry, cherries -> cherry
    singular = canonical.slice(0, -3) + 'y';
    canonical = singular;
  } else if (canonical.endsWith('oes') && canonical.length > 4) {
    // tomatoes -> tomato, potatoes -> potato
    singular = canonical.slice(0, -2);
    canonical = singular;
  } else if (canonical.endsWith('shes') || canonical.endsWith('ches') || canonical.endsWith('xes') || canonical.endsWith('zes')) {
    // dishes -> dish, peaches -> peach, boxes -> box
    singular = canonical.slice(0, -2);
    canonical = singular;
  } else if (canonical.endsWith('s') && !canonical.endsWith('ss') && canonical.length > 3) {
    // Simple -s plural: apples -> apple, grapes -> grape
    singular = canonical.slice(0, -1);
    canonical = singular;
  }

  return { canonical, singular };
}

/**
 * Determine store category from USDA category and item name
 */
function getStoreCategory(usdaCategory, itemName) {
  const nameLower = itemName.toLowerCase();

  // Check explicit overrides first
  if (CATEGORY_OVERRIDES[nameLower]) {
    return CATEGORY_OVERRIDES[nameLower];
  }

  // Check if any override key is contained in the name
  for (const [key, category] of Object.entries(CATEGORY_OVERRIDES)) {
    if (nameLower.includes(key)) {
      return category;
    }
  }

  const mapping = SR_LEGACY_TO_STORE[usdaCategory];
  if (!mapping) return null;

  // Check keywords
  if (mapping.keywords) {
    for (const [keyword, category] of Object.entries(mapping.keywords)) {
      if (nameLower.includes(keyword)) {
        return category;
      }
    }
  }

  return mapping.default;
}

/**
 * Determine subcategory based on item name
 */
function getSubcategory(storeCategory, itemName) {
  const subcats = SUBCATEGORY_KEYWORDS[storeCategory];
  if (!subcats) return null;

  const nameLower = itemName.toLowerCase();

  for (const [subcategory, keywords] of Object.entries(subcats)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        return subcategory;
      }
    }
  }

  return null;
}

/**
 * Generate plural/singular aliases
 */
function generateAliases(name) {
  const aliases = [];

  // Simple pluralization rules
  if (name.endsWith('s') && !name.endsWith('ss')) {
    // Might be plural, add singular
    aliases.push(name.slice(0, -1));
  } else if (name.endsWith('ies')) {
    // berries -> berry
    aliases.push(name.slice(0, -3) + 'y');
  } else if (name.endsWith('es')) {
    // tomatoes -> tomato
    aliases.push(name.slice(0, -2));
  } else {
    // Add plural
    if (name.endsWith('y') && !name.endsWith('ey')) {
      aliases.push(name.slice(0, -1) + 'ies');
    } else if (name.endsWith('s') || name.endsWith('x') || name.endsWith('ch') || name.endsWith('sh')) {
      aliases.push(name + 'es');
    } else {
      aliases.push(name + 's');
    }
  }

  return aliases.filter(a => a !== name && a.length > 2);
}

// Main
const db = new Database(path.join(__dirname, 'data/usda_foods.db'));

// Get SR Legacy items
const items = db.prepare(`
  SELECT fdc_id, description, food_category
  FROM sr_legacy
  WHERE food_category NOT IN ('Fast Foods', 'Restaurant Foods', 'American Indian/Alaska Native Foods')
  ORDER BY food_category, description
`).all();

console.log(`Processing ${items.length} SR Legacy items...`);

// Process items - use canonical form for deduplication
const processedItems = new Map(); // canonical -> item
const seenCanonicals = new Set();

// Also track base words (the part before the comma) to add as separate entries
const baseWords = new Map(); // base word -> { category, subcategory, count }

for (const item of items) {
  const normalizedName = normalizeName(item.description);
  if (!normalizedName || normalizedName.length < 2) continue;

  // Skip brand names and specific patterns
  if (shouldSkip(normalizedName)) continue;

  // Get canonical form for deduplication
  const { canonical, singular } = getCanonical(normalizedName);
  if (seenCanonicals.has(canonical)) continue;
  seenCanonicals.add(canonical);

  const storeCategory = getStoreCategory(item.food_category, normalizedName);
  if (!storeCategory) continue;

  const subcategory = getSubcategory(storeCategory, normalizedName);
  const aliases = generateAliases(normalizedName);

  // Use singular form as the primary name
  let primaryName = singular;
  // Add original as alias if different
  if (normalizedName !== singular && !aliases.includes(normalizedName)) {
    aliases.push(normalizedName);
  }

  processedItems.set(canonical, {
    name: primaryName,
    category: storeCategory,
    subcategory: subcategory,
    aliases: aliases.filter(a => a !== primaryName && a.length > 2),
    usdaFdcId: item.fdc_id,
  });

  // Extract base word from original description (before the comma)
  // e.g., "Milk, whole" -> "milk", "Bread, white" -> "bread"
  const descLower = item.description.toLowerCase();
  const commaIdx = descLower.indexOf(',');
  if (commaIdx > 0) {
    let baseWord = descLower.substring(0, commaIdx).trim();
    // Clean up the base word
    baseWord = baseWord.replace(/\s*\([^)]+\)\s*/g, '').trim();
    if (baseWord.length >= 3 && !shouldSkip(baseWord)) {
      const { singular: baseSingular } = getCanonical(baseWord);
      if (!baseWords.has(baseSingular)) {
        baseWords.set(baseSingular, {
          category: storeCategory,
          subcategory: subcategory,
          count: 1,
          fdcId: item.fdc_id
        });
      } else {
        baseWords.get(baseSingular).count++;
      }
    }
  }
}

// Add base words that aren't already in processedItems
let baseWordsAdded = 0;
for (const [baseWord, info] of baseWords) {
  if (!seenCanonicals.has(baseWord)) {
    // Add all base words - they're high quality since they come from USDA category names
    const aliases = generateAliases(baseWord);
    processedItems.set(baseWord, {
      name: baseWord,
      category: info.category,
      subcategory: info.subcategory,
      aliases: aliases.filter(a => a !== baseWord && a.length > 2),
      usdaFdcId: info.fdcId,
    });
    seenCanonicals.add(baseWord);
    baseWordsAdded++;
  }
}

console.log(`Added ${baseWordsAdded} base category words`)

console.log(`Generated ${processedItems.size} unique items`);

// Build final dictionary
const dictionary = {
  domain: 'grocery',
  version: '1.0.0',
  generatedAt: new Date().toISOString().split('T')[0],
  source: 'USDA FoodData Central SR Legacy + manual curation',
  license: 'CC0 1.0 Public Domain',
  attribution: 'Based on U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov',
  categories: categoryMapping.storeCategories,
  items: Array.from(processedItems.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  }),
};

// Write output
const outputPath = path.join(__dirname, '../../src/data/dictionaries/grocery.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(dictionary, null, 2));

console.log(`Wrote dictionary to ${outputPath}`);
console.log(`Total items: ${dictionary.items.length}`);

// Print category breakdown
const categoryCounts = {};
for (const item of dictionary.items) {
  categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
}
console.log('\nItems per category:');
for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

db.close();

/**
 * Test the grocery dictionary with the categorizer
 */

import { Searcher } from 'fast-fuzzy';
import groceryDict from '../../src/data/dictionaries/grocery.json';

interface DictionaryItem {
  name: string;
  category: string;
  subcategory?: string | null;
  aliases?: string[];
}

// Prepare items for fast-fuzzy (combine name + aliases for search)
const itemsWithSearchTerms = (groceryDict.items as DictionaryItem[]).map((item) => ({
  ...item,
  searchTerms: [item.name, ...(item.aliases || [])].join(' '),
  // Also store all searchable terms separately for exact matching
  allTerms: [item.name, ...(item.aliases || [])].map(t => t.toLowerCase()),
}));

// Create searcher
const searcher = new Searcher(itemsWithSearchTerms, {
  keySelector: (item) => item.searchTerms,
  threshold: 0.6,
  ignoreCase: true,
  ignoreSymbols: true,
  normalizeWhitespace: true,
  returnMatchData: true,
});

/**
 * Search with exact match boosting and length-based tiebreaking
 * Priority: exact name match > exact alias match > fuzzy match
 * Tiebreaker: prefer item name closest in length to query (O(1) vs O(n*m) Levenshtein)
 */
function searchWithExactBoost(query: string, limit = 10) {
  const queryLower = query.toLowerCase().trim();

  const results = searcher.search(query) as Array<{
    item: typeof itemsWithSearchTerms[0];
    original: string;
    score: number;
  }>;

  // Check for exact matches and compute length difference
  return results
    .map(r => {
      const isExactName = r.item.name.toLowerCase() === queryLower;
      const isExactAlias = r.item.allTerms.includes(queryLower);

      // Priority scoring: exact name = 1.01, exact alias = 1.0, fuzzy = original score
      let boostedScore = r.score;
      if (isExactName) {
        boostedScore = 1.01; // Highest priority
      } else if (isExactAlias) {
        boostedScore = 1.0; // Second priority
      }

      // O(1) tiebreaker: prefer items whose name is closest in length to query
      const lengthDiff = Math.abs(r.item.name.length - queryLower.length);

      return { ...r, score: boostedScore, lengthDiff };
    })
    .sort((a, b) => {
      // Primary: higher score first
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: smaller length difference first
      return a.lengthDiff - b.lengthDiff;
    })
    .slice(0, limit);
}

// Test items
const testInputs = [
  // Common items
  'milk',
  'bread',
  'eggs',
  'butter',
  'cheese',
  'chicken',
  'beef',
  'apples',
  'bananas',
  'orange juice',
  // Partial matches
  'chick',
  'ban',
  'chees',
  // Typos
  'mlk',
  'buter',
  'chiken',
  // Compound items
  'ground beef',
  'cheddar cheese',
  'whole milk',
  'greek yogurt',
  // Less common
  'quinoa',
  'tahini',
  'sriracha',
  'tortillas',
];

console.log('=== Grocery Dictionary Test ===\n');
console.log(`Dictionary: ${groceryDict.items.length} items, ${groceryDict.categories.length} categories\n`);

for (const input of testInputs) {
  const results = searchWithExactBoost(input, 5);

  if (results.length > 0) {
    const best = results[0];
    const category = groceryDict.categories.find((c) => c.id === best.item.category);
    console.log(`"${input}" → ${best.item.name}`);
    console.log(`  Category: ${category?.name || best.item.category}`);
    if (best.item.subcategory) {
      const subcat = category?.subcategories?.find((s) => s.id === best.item.subcategory);
      console.log(`  Subcategory: ${subcat?.name || best.item.subcategory}`);
    }
    console.log(`  Confidence: ${(best.score * 100).toFixed(0)}%`);
    if (results.length > 1) {
      console.log(`  Alternatives: ${results.slice(1, 4).map(r => r.item.name).join(', ')}`);
    }
  } else {
    console.log(`"${input}" → NO MATCH`);
  }
  console.log();
}

# Auto-Categorization System Design

A local-first, dictionary-based categorization system for CheckList supporting grocery, hardware, outdoor recreation, packing, moving, and camping/travel domains.

*Created: December 2025*

---

## Overview

### Goals

1. **Instant categorization** - suggest category as user types
2. **Offline-first** - no network calls required
3. **Multi-domain** - grocery, hardware, outdoor, packing, moving, camping
4. **Fuzzy matching** - handle typos and variations
5. **Smart parsing** - extract quantity, modifiers, and core item from natural input
6. **Learnable** - remember user corrections and custom items

### Non-Goals

- LLM/ML inference (too heavy for mobile)
- Cloud-based categorization API
- Real-time dictionary updates from server
- Barcode/image recognition

---

## Architecture

The system uses a **preprocessing layer** (custom) feeding into **fast-fuzzy** (off-the-shelf library) for search, with a **result assembly layer** (custom) to combine everything.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Input                                │
│                  "2 lb organic ground beef"                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 INPUT PREPROCESSOR (Custom)                      │
│                                                                  │
│  1. Normalize: lowercase, trim, unicode normalization            │
│  2. Tokenize: split on whitespace                                │
│  3. Classify tokens using skip-lists:                            │
│     - "2" → QUANTITY                                             │
│     - "lb" → UNIT                                                │
│     - "organic" → MODIFIER                                       │
│     - "ground", "beef" → ITEM_CANDIDATE                          │
│  4. Extract structured data:                                     │
│     - quantity: { value: 2, unit: "lb" }                         │
│     - modifiers: ["organic"]                                     │
│     - searchTerms: "ground beef"                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              USER OVERRIDE CHECK (Custom + Jazz)                 │
│                                                                  │
│  Check if user has previously categorized "ground beef"          │
│  If found → return cached category, skip search                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                         not found
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FAST-FUZZY SEARCHER (Library)                   │
│                                                                  │
│  const searcher = new Searcher(dictionaryItems, {                │
│    keySelector: (item) => item.searchTerms,  // name + aliases   │
│    threshold: 0.6,                                               │
│    returnMatchData: true                                         │
│  });                                                             │
│                                                                  │
│  searcher.search("ground beef")                                  │
│  → [{ item: {...}, score: 0.95 }, ...]                           │
│                                                                  │
│  Features provided by fast-fuzzy:                                │
│  - Internal trie structure (automatic)                           │
│  - Fuzzy matching via Damerau-Levenshtein                        │
│  - Scoring 0-1 with configurable threshold                       │
│  - Unicode/grapheme handling                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 RESULT ASSEMBLER (Custom)                        │
│                                                                  │
│  Combine search result with preprocessor output:                 │
│  {                                                               │
│    item: "ground beef",                                          │
│    category: "Meat",                                             │
│    subcategory: "Beef",                                          │
│    quantity: { value: 2, unit: "lb" },                           │
│    modifiers: ["organic"],                                       │
│    confidence: 0.95,                                             │
│    source: "dictionary"                                          │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### What We Build vs. What We Use

| Component | Build/Buy | Size Estimate |
|-----------|-----------|---------------|
| Input Preprocessor | **Build** | ~150 lines |
| Token Classifier (skip-lists) | **Build** | ~100 lines |
| Fuzzy Search Engine | **Buy** (fast-fuzzy) | 0 lines |
| Result Assembler | **Build** | ~50 lines |
| User Override Store | **Build** (Jazz schema) | ~50 lines |
| Dictionary Data | **Generate** | JSON files |
| **Total Custom Code** | | **~350 lines** |

---

## fast-fuzzy Library

### Why fast-fuzzy?

| Feature | fast-fuzzy | Fuse.js | MiniSearch |
|---------|------------|---------|------------|
| Internal trie | Yes | No | No (inverted index) |
| Fuzzy algorithm | Damerau-Levenshtein | Bitap | Levenshtein |
| Transposition handling | Yes (less penalty) | No | No |
| Unicode/grapheme support | Yes | Yes | Yes |
| Reusable Searcher class | Yes | Yes | Yes |
| Bundle size | ~3KB | ~5KB | ~7KB |
| License | **ISC** | Apache 2.0 | MIT |

### fast-fuzzy API

```typescript
import { Searcher, search, fuzzy } from 'fast-fuzzy';

// Single comparison
fuzzy("ground beef", "ground beef patties"); // → 0.85

// One-off search
search("beef", ["chicken", "ground beef", "pork"]); // → ["ground beef"]

// Reusable searcher (recommended for our use case)
const searcher = new Searcher(items, {
  keySelector: (item) => item.name,      // What to search on
  threshold: 0.6,                         // Minimum score (0-1)
  ignoreCase: true,                       // Case insensitive
  ignoreSymbols: true,                    // Ignore punctuation
  normalizeWhitespace: true,              // Collapse whitespace
  returnMatchData: true,                  // Include score in results
  sortBy: "bestMatch"                     // or "insertOrder"
});

const results = searcher.search("ground beef");
// → [{ item: {...}, original: "ground beef", score: 0.95 }]
```

### Configuration for Our Use Case

```typescript
const categorizationSearcher = new Searcher(dictionaryItems, {
  // Search on name and all aliases
  keySelector: (item) => [item.name, ...(item.aliases || [])].join(' '),

  // Require decent match quality
  threshold: 0.6,

  // Normalization (matches our preprocessor)
  ignoreCase: true,
  ignoreSymbols: true,
  normalizeWhitespace: true,

  // We need scores for confidence
  returnMatchData: true,

  // Best matches first
  sortBy: "bestMatch"
});
```

---

## Data Structures

### 1. Domain Configuration

```typescript
interface DomainConfig {
  id: string;                    // "grocery", "hardware", etc.
  name: string;                  // "Grocery Store"
  categories: Category[];
  searcher: Searcher<DictionaryItem>;  // fast-fuzzy Searcher instance
}

interface Category {
  id: string;                    // "produce", "meat"
  name: string;                  // "Produce"
  subcategories?: Subcategory[];
  sortOrder: number;
  icon?: string;
}

interface Subcategory {
  id: string;
  name: string;
  sortOrder: number;
}
```

### 2. Dictionary Item

```typescript
interface DictionaryItem {
  name: string;                  // "ground beef" (canonical)
  category: string;              // "meat"
  subcategory?: string;          // "beef"
  aliases?: string[];            // ["hamburger meat", "minced beef"]
  defaultUnit?: string;          // "lb"

  // Computed field for fast-fuzzy (name + aliases joined)
  searchTerms: string;
}
```

### 3. Skip-Lists (Token Classification)

```typescript
interface SkipLists {
  // Regex patterns for quantities
  quantityPatterns: RegExp[];    // /^\d+(\.\d+)?$/, /^(one|two|three)$/

  // Unit variations mapped to canonical form
  units: Map<string, UnitEntry>;

  // Simple word sets
  sizes: Set<string>;            // "small", "large", "family-size"
  modifiers: Set<string>;        // "organic", "fresh", "frozen"
  brands: Set<string>;           // "kirkland", "great-value"
}

interface UnitEntry {
  canonical: string;             // "pound"
  category: "weight" | "volume" | "count" | "length";
}
```

**Skip-List Sizes:**

| List | Count | Examples |
|------|-------|----------|
| Quantity patterns | ~10 regex | digits, fractions, number words |
| Units | ~60 entries | lb/lbs/pound/pounds → "pound" |
| Sizes | ~30 terms | small, medium, large, xl |
| Modifiers | ~150 terms | organic, fresh, frozen, boneless |
| Brands | ~300 terms | kirkland, great-value, store-brand |

### 4. User Override Store (Jazz Schema)

```typescript
// In src/schemas/categorization.ts
import { co, z } from 'jazz-tools';

export const UserOverride = co.map({
  input: z.string(),             // Normalized input text
  categoryId: z.string(),
  subcategoryId: z.optional(z.string()),
  domainId: z.string(),
  createdAt: z.date(),
  usageCount: z.number(),
});

export const UserOverrideList = co.list(UserOverride);

// Add to GroceriesAccount root
// categoryOverrides: UserOverrideList
```

---

## Algorithms

### Algorithm 1: Input Preprocessing

```typescript
interface PreprocessedInput {
  original: string;
  normalized: string;
  tokens: ClassifiedToken[];
  quantity?: ParsedQuantity;
  modifiers: string[];
  searchTerms: string;           // What to send to fast-fuzzy
}

interface ClassifiedToken {
  value: string;
  type: "QUANTITY" | "UNIT" | "SIZE" | "MODIFIER" | "BRAND" | "ITEM";
}

interface ParsedQuantity {
  value: number;
  unit?: string;
  unitCanonical?: string;        // "lb" → "pound"
}
```

**Steps:**

```
Input: "2 lb organic ground beef"

1. Normalize
   → "2 lb organic ground beef"

2. Tokenize
   → ["2", "lb", "organic", "ground", "beef"]

3. Classify each token (left to right):
   - "2" matches quantity pattern → QUANTITY
   - "lb" is in units map → UNIT
   - "organic" is in modifiers set → MODIFIER
   - "ground" not in any skip-list → ITEM
   - "beef" not in any skip-list → ITEM

4. Extract structured data:
   - quantity: { value: 2, unit: "lb", unitCanonical: "pound" }
   - modifiers: ["organic"]
   - searchTerms: "ground beef" (ITEM tokens joined)

5. Return PreprocessedInput
```

### Algorithm 2: Categorization Flow

```typescript
function categorize(
  input: string,
  domainId: string,
  userOverrides: UserOverrideList
): CategorizationResult {

  // 1. Preprocess
  const processed = preprocess(input, skipLists);

  // 2. Check user overrides first
  const override = findOverride(processed.searchTerms, domainId, userOverrides);
  if (override) {
    return {
      ...assembleResult(processed, null),
      category: override.categoryId,
      subcategory: override.subcategoryId,
      confidence: 1.0,
      source: "user"
    };
  }

  // 3. Search with fast-fuzzy
  const domain = getDomain(domainId);
  const results = domain.searcher.search(processed.searchTerms);

  if (results.length === 0) {
    return {
      ...assembleResult(processed, null),
      confidence: 0,
      source: "none"
    };
  }

  // 4. Assemble result from best match
  const best = results[0];
  return assembleResult(processed, best);
}

function assembleResult(
  processed: PreprocessedInput,
  match: SearchResult | null
): CategorizationResult {
  return {
    originalInput: processed.original,
    item: match?.item.name || processed.searchTerms,
    category: match?.item.category,
    subcategory: match?.item.subcategory,
    quantity: processed.quantity,
    modifiers: processed.modifiers,
    confidence: match?.score || 0,
    source: match ? "dictionary" : "none"
  };
}
```

### Algorithm 3: Real-time Suggestions

```typescript
function suggest(
  partialInput: string,
  domainId: string,
  limit: number = 5
): Suggestion[] {

  // 1. Preprocess (partial input may have incomplete last token)
  const processed = preprocess(partialInput, skipLists);

  // 2. Search
  const domain = getDomain(domainId);
  const results = domain.searcher.search(processed.searchTerms);

  // 3. Format suggestions
  return results.slice(0, limit).map(result => ({
    text: result.item.name,
    category: result.item.category,
    subcategory: result.item.subcategory,
    score: result.score
  }));
}
```

---

## Dictionary Data Sources

### Licensing Summary

| Source | License | Commercial Use | Attribution Required | Share-Alike |
|--------|---------|----------------|---------------------|-------------|
| **USDA FoodData Central** | CC0 1.0 (Public Domain) | Yes | Requested, not required | No |
| **Open Food Facts** | ODbL | Yes | Yes | Yes (for databases) |
| **Spoonacular API** | Proprietary | Limited (150 req/day free) | Per terms | N/A |
| **Wikipedia/Wikidata** | CC BY-SA | Yes | Yes | Yes |
| **Manual curation** | Original work | Yes | No | No |

### Recommended Approach by Domain

#### Grocery Domain

**Primary Source: USDA FoodData Central**
- License: **CC0 1.0 Public Domain** - no restrictions
- ~8,000 food items with categories
- API: https://fdc.nal.usda.gov/api-guide/
- Rate limit: 1,000 requests/hour (free API key)
- Suggested citation: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov"

**Secondary Source: Open Food Facts** (for gaps)
- License: **ODbL** - requires attribution and share-alike for database derivatives
- Attribution: "(c) Open Food Facts contributors" with link
- Note: If we combine USDA + Open Food Facts into our dictionary, the combined result would need ODbL licensing
- Recommendation: Use USDA as primary (public domain), fill gaps manually

**Generation Process:**
1. Pull USDA FoodData Central food items via API
2. Filter to consumer grocery items (exclude restaurant items, raw ingredients)
3. Map USDA food groups to our category structure
4. Deduplicate and normalize names
5. Add common aliases manually (USDA names can be technical)
6. Manual review and curation

#### Hardware Domain

**Primary Source: Manual curation + Wikipedia**
- Wikipedia lists: CC BY-SA license
- Most hardware items are common vocabulary
- No comprehensive open database exists

**Generation Process:**
1. Reference Home Depot/Lowe's category structures (for organization only)
2. Build item lists from Wikipedia tool/hardware articles
3. Add trade terminology as aliases
4. Manual curation

#### Packing / Moving / Camping Domains

**Primary Source: Manual curation**
- These are well-known, finite vocabularies
- Aggregate from public packing lists, moving checklists, camping guides
- Original compilation = no licensing concerns

**Generation Process:**
1. Collect items from multiple public sources
2. Deduplicate and categorize
3. Smaller domains (~300-400 items each), mostly manual

### Skip-Lists Sources

| Skip-List | Source | Notes |
|-----------|--------|-------|
| Units | Manual | Standard measurement units, finite list |
| Modifiers | USDA descriptors + manual | USDA has food descriptor vocabulary |
| Sizes | Manual | Standard size terms |
| Brands | Manual | Major grocery/hardware brands |

---

## Domain Dictionaries

### Grocery Domain (~2,500 items)

**Categories:**

| ID | Name | Subcategories | Est. Items |
|----|------|---------------|------------|
| produce | Produce | Fruits, Vegetables, Herbs, Salads | 300 |
| meat | Meat | Beef, Pork, Poultry, Lamb, Game | 200 |
| seafood | Seafood | Fish, Shellfish, Prepared | 100 |
| dairy | Dairy | Milk, Cheese, Yogurt, Butter, Eggs | 150 |
| deli | Deli | Sliced Meats, Cheeses, Prepared | 80 |
| bakery | Bakery | Bread, Rolls, Pastries, Cakes | 100 |
| frozen | Frozen | Meals, Vegetables, Desserts, Pizza, Breakfast | 300 |
| canned | Canned & Jarred | Vegetables, Soups, Sauces, Beans, Fruits | 250 |
| pasta | Pasta & Grains | Pasta, Rice, Noodles, Grains | 100 |
| cereal | Breakfast | Cereal, Oatmeal, Bars, Pancake Mix | 120 |
| snacks | Snacks | Chips, Crackers, Nuts, Cookies, Candy | 200 |
| beverages | Beverages | Soda, Juice, Water, Coffee, Tea, Sports | 200 |
| condiments | Condiments | Sauces, Dressings, Oils, Vinegars, Spices | 200 |
| baking | Baking | Flour, Sugar, Mixes, Chocolate, Decorating | 120 |
| international | International | Mexican, Asian, Indian, Italian, Kosher | 150 |
| health | Health & Beauty | OTC Medicine, Vitamins, Toiletries | 150 |
| cleaning | Cleaning | Laundry, Dish, Surface, Paper Goods | 100 |
| baby | Baby | Diapers, Formula, Food, Care | 80 |
| pet | Pet | Dog Food, Cat Food, Treats, Supplies | 100 |

### Hardware Domain (~1,500 items)

| ID | Name | Subcategories | Est. Items |
|----|------|---------------|------------|
| lumber | Lumber | Dimensional, Plywood, Molding, Treated | 80 |
| electrical | Electrical | Wire, Outlets, Switches, Breakers, Lighting | 200 |
| plumbing | Plumbing | Pipe, Fittings, Faucets, Toilets, Water Heater | 200 |
| hardware | Hardware | Fasteners, Hinges, Hooks, Brackets, Anchors | 250 |
| tools | Tools | Hand Tools, Power Tools, Accessories | 200 |
| paint | Paint | Interior, Exterior, Primer, Stain, Supplies | 150 |
| garden | Garden | Plants, Soil, Fertilizer, Tools, Irrigation | 150 |
| flooring | Flooring | Tile, Laminate, Vinyl, Carpet, Underlayment | 80 |
| kitchen-bath | Kitchen & Bath | Cabinets, Counters, Fixtures, Accessories | 100 |
| outdoor | Outdoor | Fencing, Decking, Concrete, Landscape | 100 |

### Packing/Travel Domain (~300 items)

| ID | Name | Est. Items |
|----|------|------------|
| clothing | Clothing | 60 |
| toiletries | Toiletries | 50 |
| electronics | Electronics | 40 |
| documents | Documents | 20 |
| medications | Medications | 30 |
| accessories | Accessories | 40 |
| comfort | Comfort Items | 30 |
| misc | Miscellaneous | 30 |

### Moving Domain (~400 items)

| ID | Name | Est. Items |
|----|------|------------|
| kitchen | Kitchen | 80 |
| bedroom | Bedroom | 50 |
| bathroom | Bathroom | 40 |
| living | Living Room | 50 |
| dining | Dining Room | 30 |
| office | Office | 40 |
| garage | Garage | 50 |
| outdoor | Outdoor | 30 |
| supplies | Moving Supplies | 30 |

### Outdoor Recreation Domain (984 items) ✅ IMPLEMENTED

| ID | Name | Est. Items |
|----|------|------------|
| **CAMPING & HIKING** |
| camp-kitchen | Camp Kitchen | 50 |
| sleep-system | Sleep System | 46 |
| shelter | Shelter | 41 |
| backpacks | Packs & Bags | 41 |
| tools | Tools & Knives | 40 |
| safety | Safety & First Aid | 39 |
| lighting | Lighting | 38 |
| power | Power & Electronics | 37 |
| furniture | Camp Furniture | 34 |
| protection | Protection | 34 |
| navigation | Navigation | 34 |
| hydration | Hydration | 33 |
| fire | Fire & Fuel | 33 |
| coolers | Coolers | 30 |
| **PADDLING** |
| paddle-gear | Paddle Gear | 46 |
| paddlecraft | Paddlecraft | 39 |
| **CYCLING** |
| bike-accessories | Bike Accessories | 62 |
| bike-maintenance | Bike Maintenance | 40 |
| bikes | Bikes | 34 |
| **CLIMBING** |
| climbing-hardware | Climbing Hardware | 44 |
| ropes-harnesses | Ropes & Harnesses | 40 |
| **SNOW SPORTS** |
| snow-gear | Snow Gear | 50 |
| avalanche-safety | Avalanche Safety | 12 |
| **CLOTHING & FOOTWEAR** |
| clothing | Clothing | 43 |
| footwear | Footwear | 22 |
| accessories | Accessories | 22 |

### Camping Domain (~400 items)

| ID | Name | Est. Items |
|----|------|------------|
| shelter | Shelter | 40 |
| sleep | Sleep System | 40 |
| cooking | Cooking | 60 |
| clothing | Clothing | 50 |
| navigation | Navigation | 20 |
| safety | Safety & First Aid | 50 |
| lighting | Lighting | 20 |
| hygiene | Hygiene | 30 |
| gear | Gear & Accessories | 50 |
| food | Food & Water | 40 |

---

## Dictionary File Format

```typescript
// grocery.json
interface DictionaryFile {
  domain: string;                // "grocery"
  version: string;               // "1.0.0"
  generatedAt: string;           // ISO date
  source: string;                // "USDA FoodData Central + manual curation"
  license: string;               // "CC0 1.0 Public Domain"
  categories: CategoryDefinition[];
  items: ItemDefinition[];
}

interface CategoryDefinition {
  id: string;
  name: string;
  subcategories?: { id: string; name: string }[];
  sortOrder: number;
}

interface ItemDefinition {
  name: string;                  // "ground beef"
  category: string;              // "meat"
  subcategory?: string;          // "beef"
  aliases?: string[];            // ["hamburger meat", "minced beef"]
  unit?: string;                 // "lb"
}
```

---

## Storage & Performance

### Dictionary Storage

| Domain | Items | JSON Size | Gzipped | Memory (Searcher) |
|--------|-------|-----------|---------|-------------------|
| Grocery | 2,276 | ~180 KB | ~35 KB | ~450 KB |
| Hardware | 1,362 | ~110 KB | ~22 KB | ~270 KB |
| Outdoor | 984 | ~80 KB | ~16 KB | ~200 KB |
| Packing | 300 | ~25 KB | ~5 KB | ~60 KB |
| Moving | 400 | ~30 KB | ~6 KB | ~80 KB |
| Camping | 400 | ~30 KB | ~6 KB | ~80 KB |
| Skip-lists | ~550 | ~15 KB | ~3 KB | ~20 KB |
| **Total** | **~6,000** | **~450 KB** | **~90 KB** | **~1.1 MB** |

### Loading Strategy

1. **Bundle grocery + skip-lists** in main app bundle (~45 KB gzipped)
2. **Lazy-load other domains** on first use
3. **Cache in IndexedDB** for offline access
4. **Create Searcher once** per domain, reuse for all queries

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Preprocessing | < 1ms | Regex + set lookups |
| fast-fuzzy search | < 5ms | Trie + fuzzy matching |
| Full categorization | < 10ms | Total pipeline |
| Suggestions (as-you-type) | < 10ms | Debounced 150-200ms anyway |
| Dictionary load | < 100ms | Parse JSON + create Searcher |

---

## File Structure

```
src/
├── lib/
│   └── categorization/
│       ├── index.ts              # Public API exports
│       ├── types.ts              # TypeScript interfaces
│       ├── preprocessor.ts       # Input preprocessing + token classification
│       ├── skipLists.ts          # Skip-list data and lookup
│       ├── categorizer.ts        # Main categorization logic
│       ├── suggester.ts          # Real-time suggestions
│       └── domainLoader.ts       # Lazy loading + Searcher creation
│
├── data/
│   └── dictionaries/
│       ├── grocery.json
│       ├── hardware.json
│       ├── outdoor.json
│       ├── packing.json
│       ├── moving.json
│       ├── camping.json
│       └── skip-lists.json
│
└── schemas/
    └── categorization.ts         # Jazz schema for user overrides
```

---

## Public API

```typescript
// Main categorization
function categorize(
  input: string,
  domainId: string,
  options?: { userOverrides?: UserOverrideList }
): CategorizationResult;

// Real-time suggestions
function suggest(
  partialInput: string,
  domainId: string,
  limit?: number
): Suggestion[];

// Domain management
function getDomains(): DomainConfig[];
function getDomain(domainId: string): DomainConfig;
function loadDomain(domainId: string): Promise<void>;
function isDomainLoaded(domainId: string): boolean;

// User overrides (called by UI when user corrects category)
function saveOverride(
  input: string,
  categoryId: string,
  domainId: string,
  overrides: UserOverrideList
): void;

// Types
interface CategorizationResult {
  originalInput: string;
  item: string;                  // Canonical item name or original
  category?: string;
  subcategory?: string;
  quantity?: { value: number; unit?: string };
  modifiers: string[];
  confidence: number;            // 0-1
  source: "dictionary" | "user" | "none";
}

interface Suggestion {
  text: string;
  category: string;
  subcategory?: string;
  score: number;
}
```

---

## User Interface Implementation

### Template Context Menu

Add "Categorization..." entry to template folder context menu:

```
┌─────────────────────────┐
│ Rename                  │
│ Duplicate               │
├─────────────────────────┤
│ Categorization...       │  ← NEW
├─────────────────────────┤
│ Export                  │
│ Delete                  │
└─────────────────────────┘
```

**File:** `src/components/tree/FolderNodeView.tsx`

### Categorization Settings Dialog

New dialog component for configuring auto-categorization per template:

```
┌─────────────────────────────────────────────┐
│ Categorization Settings                   ✕ │
├─────────────────────────────────────────────┤
│                                             │
│ Auto-categorize new items:                  │
│                                             │
│   ○ None (manual organization)              │
│   ● Grocery Store                           │
│   ○ Hardware Store                          │
│   ○ Packing / Travel                        │
│   ○ Moving                                  │
│   ○ Camping                                 │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ When items are categorized:                 │
│   ☑ Create missing categories automatically │
│   ☑ Show confirmation after adding          │
│                                             │
│                          [Cancel]  [Save]   │
└─────────────────────────────────────────────┘
```

**New file:** `src/components/categorization/CategorizationSettingsDialog.tsx`

### Domain Options

| Value | Label | Description |
|-------|-------|-------------|
| `undefined` | None | Manual organization (no auto-categorization) |
| `"grocery"` | Grocery Store | Store aisle categories (Produce, Dairy, Meat, etc.) |
| `"hardware"` | Hardware Store | Hardware categories (Electrical, Plumbing, Tools, etc.) |
| `"outdoor"` | Outdoor Recreation | Outdoor activity categories (Camping, Paddling, Cycling, Climbing, Snow Sports, etc.) |
| `"packing"` | Packing / Travel | Travel categories (Clothing, Toiletries, Electronics, etc.) |
| `"moving"` | Moving | Room-based categories (Kitchen, Bedroom, Garage, etc.) |
| `"camping"` | Camping | Outdoor categories (Shelter, Cooking, Safety, etc.) |

### Schema Changes

Add fields to `FolderNode` schema for template-folder type:

```typescript
// In src/schemas/tree.ts, add to FolderNode
categorizationDomain: z.optional(z.string()),      // Domain ID or undefined for none
categorizationAutoCreate: z.optional(z.boolean()), // Auto-create missing categories
categorizationShowConfirm: z.optional(z.boolean()),// Show toast confirmation
```

**Defaults when undefined:**
- `categorizationDomain`: `undefined` (no auto-categorization)
- `categorizationAutoCreate`: `true`
- `categorizationShowConfirm`: `true`

### Behavior Matrix

| Domain Setting | On Item Add | Category Exists | Category Missing + AutoCreate | Category Missing + No AutoCreate |
|----------------|-------------|-----------------|-------------------------------|----------------------------------|
| None/undefined | Add to current location | N/A | N/A | N/A |
| Any domain | Categorize item | Add under category | Create category, add item | Add to "Uncategorized" |

### Confirmation Toast

When `categorizationShowConfirm` is enabled:

```
┌─────────────────────────────────────────────┐
│ ✓ Added "2% milk" to Dairy       [Change]   │
└─────────────────────────────────────────────┘
```

- Auto-dismisses after 3 seconds
- "Change" opens category picker for override
- Override saves to user preferences for future

### Category Auto-Creation

When `categorizationAutoCreate` is enabled and item's category doesn't exist:

1. Look up category definition from domain dictionary
2. Create new category `TemplateItem` with:
   - `type: "category"`
   - `name`: Category display name from dictionary
   - `sortOrder`: From dictionary (maintains store layout order)
3. Add item under new category
4. Categories appear in dictionary-defined order (store layout)

### UI Components to Create

| Component | File | Purpose |
|-----------|------|---------|
| `CategorizationSettingsDialog` | `src/components/categorization/CategorizationSettingsDialog.tsx` | Main settings dialog |
| `DomainPicker` | `src/components/categorization/DomainPicker.tsx` | Radio button group for domain selection |
| `CategorizationToast` | `src/components/categorization/CategorizationToast.tsx` | Confirmation toast with override |
| `CategoryOverridePicker` | `src/components/categorization/CategoryOverridePicker.tsx` | Category selection for manual override |

### Menu Item Implementation

```typescript
// In FolderNodeView.tsx dropdown menu, after "Duplicate"
{isTemplate && (
  <DropdownMenuItem onClick={() => setCategorizationDialogOpen(true)}>
    <TagIcon className="mr-2 h-4 w-4" />
    Categorization...
  </DropdownMenuItem>
)}
```

---

## Integration Points

### 1. Template Item Creation

```typescript
// In template editor, after user submits new item
function onAddItem(rawInput: string) {
  const result = categorize(rawInput, currentDomain);

  createTemplateItem({
    name: result.item,
    // Could auto-assign to category node based on result.category
    defaultQuantity: result.quantity?.value,
    notes: result.modifiers.length > 0
      ? result.modifiers.join(", ")
      : undefined
  });

  // Show confirmation with category, allow override
  showCategoryConfirmation(result);
}
```

### 2. Session Quick-Add

```typescript
// Real-time suggestions as user types
const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

const debouncedSuggest = useMemo(
  () => debounce((input: string) => {
    if (input.length >= 2) {
      setSuggestions(suggest(input, currentDomain, 5));
    } else {
      setSuggestions([]);
    }
  }, 150),
  [currentDomain]
);

// In input onChange
function onInputChange(value: string) {
  setInputValue(value);
  debouncedSuggest(value);
}
```

### 3. Import Processing

```typescript
// When importing from text
function processImportLine(line: string): ImportedItem {
  const result = categorize(line, currentDomain);
  return {
    name: result.item,
    suggestedCategory: result.category,
    quantity: result.quantity,
    confidence: result.confidence
  };
}
```

### 4. User Override Capture

```typescript
// When user manually changes category
function onCategoryOverride(
  itemName: string,
  newCategoryId: string,
  overrides: UserOverrideList
) {
  saveOverride(itemName, newCategoryId, currentDomain, overrides);
}
```

---

## Implementation Status

*Last updated: December 2025*

### Phase 1: Core Infrastructure ✅ COMPLETE

**Goal:** Basic categorization engine working in isolation

- [x] Install `fast-fuzzy` dependency (v1.12.0)
- [x] Set up dictionary JSON schema and TypeScript types (`src/lib/categorization/types.ts`)
- [x] Create skip-lists data file (`src/data/dictionaries/skip-lists.json`)
- [x] Implement preprocessor with token classification (`src/lib/categorization/preprocessor.ts`)
- [x] Create dictionary loader with Searcher initialization (`src/lib/categorization/domainLoader.ts`)
- [x] Implement main categorizer (`src/lib/categorization/categorizer.ts`)
- [x] Write unit tests for preprocessing and categorization (53 tests passing)
- [x] Export public API (`src/lib/categorization/index.ts`)
- [x] Create React hook for debounced suggestions (`src/lib/categorization/useCategorization.ts`)

**Deliverable:** `categorize("2 lb organic milk", "grocery")` returns structured result ✅

### Phase 2: Grocery Dictionary ✅ COMPLETE

**Goal:** Comprehensive grocery item dictionary

- [x] Download USDA FoodData Central SR Legacy data (7,793 items)
- [x] Write script to transform USDA data (`scripts/grocery-dictionary/generate-dictionary.cjs`)
- [x] Map 352 USDA food groups to 18 store-layout categories (`config/category-mapping.json`)
- [x] Add common aliases
- [x] Generate `src/data/dictionaries/grocery.json`
- [x] Validate with comprehensive test suite

**Deliverable:** 2,276 grocery items across 18 categories ✅

**Categories implemented:**
produce, meat, seafood, dairy, deli, bakery, frozen, canned, pasta, breakfast, snacks, beverages, condiments, baking, international, baby, health, household

### Phase 3: Schema & Settings UI ✅ COMPLETE (With Multi-Domain)

**Goal:** Users can configure categorization globally and per template

- [x] Add schema fields to `FolderNode` in `src/schemas/tree.ts`:
   - `autocompleteDomain` (template-level domain override: 'none' | 'grocery' | 'hardware' | 'all')
   - `autoCategorizeEnabled` (template-level override)
- [x] Add schema fields to `UserSettings` in `src/schemas/index.ts`:
   - `defaultAutocompleteDomain` (global default domain)
   - `enableAutoCategorization` (global default)
- [x] Settings UI in `ProfileDialog.tsx` with domain dropdown (Off, Grocery, Hardware, All)
- [x] Per-template domain selection in `FolderNodeView.tsx` dropdown menu
- [x] Settings service in `src/services/userSettingsService.ts`
- [x] Schema migration for existing UserSettings (handles old schema without domain field)

**Deliverable:** Users can select autocomplete domain globally (ProfileDialog) and per-template (folder menu) ✅

### Phase 4: Item Add Integration ✅ COMPLETE

**Goal:** Auto-categorization happens when adding items

- [x] `ItemInput` component with autocomplete dropdown (`src/components/ui/ItemInput.tsx`)
- [x] Keyboard navigation (Arrow keys, Tab, Enter, Escape)
- [x] Category info captured from suggestion selection
- [x] `TemplateItemEditor` auto-creates categories when needed
- [x] `SessionView` supports auto-categorization for quick-add

**Deliverable:** Adding "milk" to a grocery template auto-places it under "Dairy" ✅

### Phase 5: User Overrides ❌ NOT IMPLEMENTED

**Goal:** Remember user corrections

- [ ] Add `UserOverride` and `UserOverrideList` Jazz schemas
- [ ] Add `categoryOverrides` to account root
- [ ] Implement `saveOverride()` when user changes category
- [ ] Check overrides before dictionary lookup in `categorize()`
- [ ] Sync overrides across devices via Jazz

**Status:** Deferred. Current implementation works well without user overrides.

### Phase 6: Additional Domains ✅ HARDWARE + OUTDOOR COMPLETE

**Goal:** Support non-grocery use cases

- [x] Hardware dictionary (1,362 items across 16 categories)
- [x] Outdoor recreation dictionary (984 items across 26 categories)
- [ ] Packing dictionary
- [ ] Moving dictionary
- [ ] Camping dictionary
- [x] Type definitions ready (`type DomainId = 'grocery' | 'hardware' | 'outdoor' | 'packing' | 'moving' | 'camping'`)
- [x] Multi-domain support with LRU-cached searchers (max 3 domains in memory)
- [x] Domain selection UI in ProfileDialog (Off, Grocery, Hardware, Outdoor, All)
- [x] Per-template domain override in FolderNodeView

**Status:** Hardware and Outdoor domains implemented. Outdoor covers camping, hiking, paddling, cycling, climbing, and snow sports with comprehensive gear coverage. Grocery remains the default domain.

### Phase 7: Validation & Polish ✅ COMPLETE

**Goal:** Production-ready quality

- [x] 53 unit tests covering preprocessor, categorizer, and dictionary
- [x] Fuzzy matching with exact-match boosting
- [x] Debounced suggestions (100-150ms)
- [x] Error handling and edge cases

### Future Enhancement: Branded Foods Database

**Status:** Data downloaded but not integrated

- [x] Downloaded USDA Branded Foods dataset (452,998 items, 3.1GB)
- [ ] Category mapping for branded food categories
- [ ] Integration into dictionary (optional expansion)

This would significantly expand coverage with brand-specific items but increases bundle size. Consider as optional enhancement.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Match rate | > 90% | % of inputs categorized |
| Accuracy | > 95% | % correct when categorized |
| Latency | < 10ms | End-to-end categorization |
| User override rate | < 5% | % of suggestions user changes |
| Dictionary load | < 100ms | Time to load + init Searcher |
| Memory | < 1.5 MB | All domains loaded |
| Bundle size impact | < 50 KB | Gzipped, grocery + skip-lists |

---

## Open Questions

1. **Category granularity:** 2 levels max (Category > Subcategory) - confirmed

2. **Cross-domain items:** Include in all relevant domains, let context disambiguate

3. **Pluralization:** fast-fuzzy handles this via fuzzy matching ("banana" matches "bananas")

4. **ODbL concern:** If we want to use Open Food Facts data, the combined dictionary would need ODbL licensing. Recommendation: stick to USDA (public domain) + manual curation to avoid share-alike requirements.

---

## Dependencies

```json
{
  "dependencies": {
    "fast-fuzzy": "^1.12.0"
  }
}
```

**fast-fuzzy stats:**
- License: ISC (permissive, similar to MIT)
- Bundle size: ~3KB minified
- Weekly downloads: ~200K
- Last updated: Active maintenance
- GitHub: https://github.com/EthanRutherford/fast-fuzzy

---

## References

- [fast-fuzzy npm](https://www.npmjs.com/package/fast-fuzzy)
- [fast-fuzzy GitHub](https://github.com/EthanRutherford/fast-fuzzy)
- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [USDA FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide/)
- [Open Food Facts](https://world.openfoodfacts.org/)
- [Open Food Facts Terms](https://world.openfoodfacts.org/terms-of-use)

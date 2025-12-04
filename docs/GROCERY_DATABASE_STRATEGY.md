# Grocery Categorization Database Strategy

A strategy for building a comprehensive grocery item categorization database for Bubblelist.

*Created: December 2025*
*Status: ✅ IMPLEMENTED - December 2025*

---

## Executive Summary

**Goal:** Build a ~2,500 item grocery dictionary optimized for shopping list categorization.

**Result:** ✅ **2,022 items across 18 store-layout categories**

**Approach:** Hybrid strategy combining:
1. USDA FoodData Central (public domain) for base item coverage
2. Manual curation for store-aisle category mapping
3. Alias generation for natural language variations

**Key Insight:** USDA categories are *nutritional* (e.g., "Dairy and Egg Products"), not *store-layout* (e.g., separate "Dairy" and "Eggs" aisles). We need a mapping layer.

### Implementation Summary

| Component | Status | Location |
|-----------|--------|----------|
| SR Legacy dictionary | ✅ Complete | `src/data/dictionaries/grocery.json` |
| Category mapping | ✅ Complete | `scripts/grocery-dictionary/config/category-mapping.json` |
| Generator script | ✅ Complete | `scripts/grocery-dictionary/generate-dictionary.cjs` |
| Skip-lists | ✅ Complete | `src/data/dictionaries/skip-lists.json` |
| Test suite | ✅ Complete | `src/lib/categorization/__tests__/` |
| Branded foods | ⏳ Downloaded, not integrated | 452,998 items available |

---

## Data Source Analysis

### USDA FoodData Central

**What it provides:**
- ~7,800 food items (SR Legacy) with standardized names
- Nutritional food groups (25 categories)
- Public domain (CC0 1.0) - no licensing restrictions
- API: 1,000 requests/hour (free API key)

**What it lacks:**
- Store-aisle organization (USDA groups by nutrition, not shopping)
- Common aliases ("OJ" → "orange juice")
- Quantity defaults ("eggs" typically bought by dozen)
- Brand-specific variants

**USDA SR Legacy Food Groups (25):**
1. Dairy and Egg Products
2. Spices and Herbs
3. Baby Foods
4. Fats and Oils
5. Poultry Products
6. Soups, Sauces, and Gravies
7. Sausages and Luncheon Meats
8. Breakfast Cereals
9. Fruits and Fruit Juices
10. Pork Products
11. Vegetables and Vegetable Products
12. Nut and Seed Products
13. Beef Products
14. Beverages
15. Finfish and Shellfish Products
16. Legumes and Legume Products
17. Lamb, Veal, and Game Products
18. Baked Products
19. Sweets
20. Cereal Grains and Pasta
21. Fast Foods
22. Meals, Entrees, and Side Dishes
23. Snacks
24. American Indian/Alaska Native Foods
25. Restaurant Foods

### Our Target Categories (Store Layout)

| ID | Name | Maps From USDA Groups |
|----|------|----------------------|
| produce | Produce | Fruits/Fruit Juices, Vegetables/Veg Products, Spices/Herbs |
| meat | Meat & Poultry | Beef, Pork, Poultry, Lamb/Veal/Game, Sausages/Lunch Meats |
| seafood | Seafood | Finfish and Shellfish |
| dairy | Dairy | Dairy (milk, cheese, yogurt, butter portion) |
| eggs | Eggs | Dairy (eggs portion) - **split from USDA** |
| deli | Deli | Sausages/Lunch Meats (deli portion) |
| bakery | Bakery | Baked Products |
| frozen | Frozen | Meals/Entrees, (frozen items from multiple groups) |
| canned | Canned & Jarred | Soups/Sauces, Vegetables (canned), Legumes (canned) |
| pasta | Pasta & Grains | Cereal Grains and Pasta |
| breakfast | Breakfast | Breakfast Cereals |
| snacks | Snacks | Snacks, Nut/Seed Products |
| beverages | Beverages | Beverages, Fruits/Fruit Juices (juice portion) |
| condiments | Condiments | Fats/Oils, Spices/Herbs, Soups/Sauces (condiment portion) |
| baking | Baking | Sweets, (baking ingredients) |
| international | International | (manual curation - USDA doesn't have this) |
| baby | Baby | Baby Foods |
| health | Health & Beauty | (manual - USDA doesn't cover non-food) |
| cleaning | Cleaning | (manual - USDA doesn't cover non-food) |
| pet | Pet | (manual - USDA doesn't cover non-food) |

**Key transformations:**
- Split "Dairy and Egg Products" → "Dairy" + "Eggs"
- Split "Sausages and Luncheon Meats" → "Meat" (packaged) + "Deli" (fresh)
- Create "Frozen" category from items across multiple groups
- Add non-food categories (Health, Cleaning, Pet) manually

---

## Build Strategy

### Phase 1: USDA Data Extraction

**Script:** `scripts/generate-grocery-dictionary.ts`

**Steps:**
1. Register for USDA API key at data.gov
2. Download SR Legacy data via `/foods/list` endpoint
3. For each food item, extract:
   - `fdcId` (for reference)
   - `description` (item name)
   - `foodCategory` (USDA group)
4. Filter out irrelevant items:
   - Fast Foods (restaurant-specific)
   - Restaurant Foods (restaurant-specific)
   - American Indian/Alaska Native Foods (regional)
   - Items with technical/scientific names
5. Output: `usda-raw.json` (~5,000 items after filtering)

**API Usage:**
- `/foods/list` with `dataType=SR Legacy`
- Paginated: 200 items per request
- ~40 requests for full dataset

### Phase 2: Category Mapping

**Script:** `scripts/map-usda-categories.ts`

**Approach:**
Create a mapping table from USDA food groups to our store categories:

```typescript
const USDA_TO_STORE_MAP: Record<string, StoreCategoryMapping> = {
  "Dairy and Egg Products": {
    default: "dairy",
    keywords: {
      "egg": "eggs",
      "milk": "dairy",
      "cheese": "dairy",
      "yogurt": "dairy",
      "butter": "dairy",
      "cream": "dairy",
    }
  },
  "Fruits and Fruit Juices": {
    default: "produce",
    keywords: {
      "juice": "beverages",
      "frozen": "frozen",
      "canned": "canned",
      "dried": "snacks",
    }
  },
  "Vegetables and Vegetable Products": {
    default: "produce",
    keywords: {
      "frozen": "frozen",
      "canned": "canned",
    }
  },
  // ... etc
};
```

**Keyword-based routing:**
- Items containing "frozen" → frozen category
- Items containing "canned" → canned category
- Items containing "juice" from Fruits → beverages
- Items containing "egg" from Dairy → eggs

**Output:** `mapped-items.json` with store categories assigned

### Phase 3: Name Normalization

**Script:** `scripts/normalize-names.ts`

**Transformations:**
1. Remove USDA technical suffixes: "Apples, raw" → "apple"
2. Remove preparation methods for base items: "Chicken, breast, meat only, cooked, roasted" → "chicken breast"
3. Singularize where appropriate: "Oranges" → "orange"
4. Lowercase and trim

**Rules:**
```typescript
const NORMALIZATION_RULES = [
  // Remove ", raw" suffix
  { pattern: /,\s*raw$/i, replacement: "" },

  // Remove cooking methods from end
  { pattern: /,\s*(cooked|roasted|baked|fried|grilled|steamed|boiled).*$/i, replacement: "" },

  // Remove "meat only" qualifiers
  { pattern: /,\s*meat only.*$/i, replacement: "" },

  // Simplify compound descriptions
  { pattern: /^([^,]+),.*$/, replacement: "$1" },
];
```

**Output:** `normalized-items.json`

### Phase 4: Alias Generation

**Script:** `scripts/generate-aliases.ts`

**Alias types:**

1. **Plural/Singular variations** (automated)
   - "apple" → ["apples"]
   - "eggs" → ["egg"]

2. **Common abbreviations** (manual list)
   - "orange juice" → ["oj"]
   - "peanut butter" → ["pb"]

3. **Regional variations** (manual list)
   - "soda" → ["pop", "soft drink", "coke"]
   - "green onion" → ["scallion", "spring onion"]

4. **Brand-as-generic** (manual list)
   - "tissues" → ["kleenex"]
   - "plastic wrap" → ["saran wrap"]

5. **Colloquial names** (manual list)
   - "ground beef" → ["hamburger meat", "burger meat", "minced beef"]

**Alias database:** `aliases.json`
```json
{
  "abbreviations": {
    "orange juice": ["oj"],
    "peanut butter": ["pb", "pnut butter"],
    "barbecue": ["bbq"],
    ...
  },
  "regional": {
    "soda": ["pop", "soft drink"],
    "sub roll": ["hoagie roll", "grinder roll"],
    ...
  },
  "colloquial": {
    "ground beef": ["hamburger meat", "burger meat", "minced beef"],
    "2% milk": ["reduced fat milk"],
    ...
  }
}
```

### Phase 5: Manual Curation

**Process:**
1. Review generated items for obvious errors
2. Add missing common items (especially non-USDA like cleaning products)
3. Verify category assignments
4. Add subcategory assignments
5. Set default units for common items

**Manual additions needed:**

| Category | Items to Add | Source |
|----------|--------------|--------|
| health | OTC medicine, vitamins, toiletries | Manual |
| cleaning | Laundry, dish soap, paper towels | Manual |
| pet | Dog/cat food, treats, supplies | Manual |
| international | Specialty ethnic foods | Manual |
| deli | Fresh deli counter items | Manual |

**Validation checklist:**
- [ ] Every produce item in correct subcategory (fruits/vegetables/herbs)
- [ ] Every meat item in correct subcategory (beef/pork/poultry/seafood)
- [ ] Frozen items not duplicated in fresh categories
- [ ] Canned items not duplicated in fresh categories
- [ ] Common household items included

### Phase 6: Subcategory Assignment

**Produce subcategories:**
```typescript
const PRODUCE_SUBCATEGORIES = {
  fruits: ["apple", "banana", "orange", "berry", "melon", "citrus", ...],
  vegetables: ["carrot", "broccoli", "potato", "onion", "pepper", ...],
  herbs: ["basil", "cilantro", "parsley", "mint", "rosemary", ...],
  salads: ["lettuce", "spinach", "kale", "arugula", "mixed greens", ...],
};
```

**Meat subcategories:**
```typescript
const MEAT_SUBCATEGORIES = {
  beef: ["steak", "ground beef", "roast", "ribs", ...],
  pork: ["bacon", "ham", "pork chops", "sausage", ...],
  poultry: ["chicken", "turkey", "duck", ...],
  lamb: ["lamb chops", "leg of lamb", ...],
};
```

**Assignment approach:**
- Keyword matching within category
- Default to "other" subcategory if no match

### Phase 7: Default Units

**Common defaults:**
```typescript
const DEFAULT_UNITS: Record<string, string> = {
  "milk": "gallon",
  "eggs": "dozen",
  "butter": "stick",
  "ground beef": "pound",
  "chicken breast": "pound",
  "bread": "loaf",
  "water": "case",
  // ...
};
```

---

## Output Format

**Final file:** `src/data/dictionaries/grocery.json`

```json
{
  "domain": "grocery",
  "version": "1.0.0",
  "generatedAt": "2025-12-XX",
  "source": "USDA FoodData Central SR Legacy + manual curation",
  "license": "CC0 1.0 Public Domain",
  "attribution": "Based on U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov",
  "categories": [
    {
      "id": "produce",
      "name": "Produce",
      "sortOrder": 1,
      "subcategories": [
        { "id": "fruits", "name": "Fruits", "sortOrder": 1 },
        { "id": "vegetables", "name": "Vegetables", "sortOrder": 2 },
        { "id": "herbs", "name": "Herbs", "sortOrder": 3 }
      ]
    },
    // ... 19 more categories
  ],
  "items": [
    {
      "name": "apple",
      "category": "produce",
      "subcategory": "fruits",
      "aliases": ["apples", "red apple", "green apple", "gala apple", "fuji apple"],
      "usdaFdcId": 171688
    },
    // ... ~2,500 items
  ]
}
```

---

## Validation Strategy

### Automated Tests

1. **Coverage test:** Every USDA food group has mapping
2. **Orphan test:** No items without category
3. **Duplicate test:** No duplicate item names
4. **Alias conflict test:** No alias maps to multiple items

### Real-World Validation

**Test datasets:**
1. Reddit r/mealprep shopping lists
2. Recipe ingredient lists (AllRecipes, Serious Eats)
3. Sample Instacart/Walmart grocery orders

**Metrics:**
| Metric | Target |
|--------|--------|
| Item match rate | > 90% |
| Category accuracy | > 95% |
| Alias coverage | Common items have 2+ aliases |

### Manual Review

1. Random sample 200 items, verify categories
2. Test 50 real shopping list inputs
3. Review items with low-confidence fuzzy matches

---

## Implementation Timeline

✅ **All phases completed - December 2025**

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | USDA extraction script | ✅ Complete |
| 2 | Category mapping | ✅ Complete (352 USDA → 18 store categories) |
| 3 | Name normalization | ✅ Complete |
| 4 | Alias generation | ✅ Complete |
| 5 | Manual curation | ✅ Complete |
| 6 | Subcategory assignment | ✅ Complete |
| 7 | Default units | ✅ Complete |
| Validation | Testing & fixes | ✅ Complete (53 tests passing) |

---

## Alternative Approaches Considered

### Option A: Pure Manual Curation
- **Pros:** Complete control, no transformation errors
- **Cons:** 80+ hours of work, higher chance of gaps
- **Verdict:** Not practical for 2,500 items

### Option B: LLM Generation
- **Pros:** Could generate aliases and categorize quickly
- **Cons:** Hallucination risk, inconsistent output, cost
- **Verdict:** Could use for alias generation only, with human review

### Option C: Open Food Facts
- **Pros:** More items, barcode data
- **Cons:** ODbL license (share-alike), messy data
- **Verdict:** Avoid due to licensing complexity

### Chosen: Option D (Hybrid USDA + Manual)
- **Pros:** Public domain base, manageable manual work
- **Cons:** Requires transformation scripts
- **Verdict:** Best balance of coverage and control

---

## Scripts to Create

```
scripts/
├── grocery-dictionary/
│   ├── 01-fetch-usda.ts         # Download USDA data
│   ├── 02-map-categories.ts     # Map to store categories
│   ├── 03-normalize-names.ts    # Clean up names
│   ├── 04-generate-aliases.ts   # Add aliases
│   ├── 05-add-subcategories.ts  # Assign subcategories
│   ├── 06-add-defaults.ts       # Add default units
│   ├── 07-validate.ts           # Run validation checks
│   ├── config/
│   │   ├── usda-category-map.json
│   │   ├── aliases.json
│   │   ├── manual-items.json
│   │   └── default-units.json
│   └── run-all.ts               # Pipeline runner
```

---

## Open Questions

1. **Frozen vs Fresh distinction:** Should "broccoli" in produce also have "frozen broccoli" in frozen? Or rely on "frozen" modifier detection?
   - *Recommendation:* Include both explicitly for better matching

2. **Brand handling:** Include major brands (Cheerios, Oreos) as aliases, or separate items?
   - *Recommendation:* Aliases for generics ("cheerios" → "cereal"), separate items only for truly distinct products

3. **Organic/specialty variants:** "organic milk" as alias or separate item?
   - *Recommendation:* Let preprocessor handle "organic" as modifier, don't duplicate items

4. **Regional store differences:** Walmart vs Whole Foods vs Costco have different layouts
   - *Recommendation:* Use generic store layout, let users override per-template

---

## References

- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [USDA FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide/)
- [SR Legacy Documentation](https://www.ars.usda.gov/arsuserfiles/80400525/data/sr-legacy/sr-legacy_doc.pdf)
- [Data.gov API Key Registration](https://api.data.gov/signup/)

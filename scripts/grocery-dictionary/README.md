# Grocery Dictionary Generator

Scripts and data for building the Bubblelist grocery categorization database.

## Data Sources

All data from USDA FoodData Central (CC0 Public Domain):
- **SR Legacy**: 7,793 generic food items with 25 nutritional categories
- **Foundation Foods**: 340 foundational food items
- **Branded Foods**: 452,998 branded products with 352 store-aisle categories

## Directory Structure

```
grocery-dictionary/
├── data/
│   ├── FoodData_Central_sr_legacy_food_json_2018-04.json      # 201 MB
│   ├── FoodData_Central_foundation_food_json_2025-04-24.json  # 6.3 MB
│   ├── FoodData_Central_branded_food_json_2025-04-24.json     # 3.1 GB
│   └── usda_foods.db                                           # SQLite database
├── config/
│   └── category-mapping.json   # Maps 352 USDA categories -> 18 store aisles
├── generate-dictionary.js      # Main generator script
└── README.md
```

## Download USDA Data

Download the bulk JSON files from USDA FoodData Central:

```bash
cd data/

# SR Legacy (generic foods)
curl -O "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"
unzip FoodData_Central_sr_legacy_food_json_2018-04.zip

# Foundation Foods
curl -O "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-04-24.zip"
unzip FoodData_Central_foundation_food_json_2025-04-24.zip

# Branded Foods (large - 800MB zip, 3.1GB unzipped)
curl -O "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2025-04-24.zip"
unzip FoodData_Central_branded_food_json_2025-04-24.zip
```

## Import to SQLite

### SR Legacy Import

The SR Legacy JSON structure:
```json
{
  "SRLegacyFoods": [
    {
      "fdcId": 167512,
      "description": "Pillsbury Golden Layer Buttermilk Biscuits...",
      "foodCategory": { "description": "Baked Products" },
      "ndbNumber": 18010,
      "dataType": "SR Legacy",
      "publicationDate": "4/1/2019"
    }
  ]
}
```

Import command:
```bash
# Create table
sqlite3 usda_foods.db 'CREATE TABLE sr_legacy (
  fdc_id INTEGER PRIMARY KEY,
  description TEXT,
  food_category TEXT,
  ndb_number INTEGER,
  data_type TEXT,
  publication_date TEXT
);'

# Extract to CSV and import
jq -r '.SRLegacyFoods[] | [.fdcId, .description, .foodCategory.description, .ndbNumber, .dataType, .publicationDate] | @csv' \
  FoodData_Central_sr_legacy_food_json_2018-04.json > /tmp/sr_legacy.csv

sqlite3 usda_foods.db ".mode csv" ".import /tmp/sr_legacy.csv sr_legacy"

# Verify: should show 7793
sqlite3 usda_foods.db "SELECT COUNT(*) FROM sr_legacy;"
```

### Foundation Foods Import

The Foundation JSON structure:
```json
{
  "FoundationFoods": [
    {
      "fdcId": 2346405,
      "description": "Hummus, commercial",
      "foodCategory": { "description": "Legumes and Legume Products" },
      "dataType": "Foundation",
      "publicationDate": "10/28/2021"
    }
  ]
}
```

Import command:
```bash
# Create table
sqlite3 usda_foods.db 'CREATE TABLE foundation (
  fdc_id INTEGER PRIMARY KEY,
  description TEXT,
  food_category TEXT,
  data_type TEXT,
  publication_date TEXT
);'

# Extract and import
jq -r '.FoundationFoods[] | [.fdcId, .description, .foodCategory.description, .dataType, .publicationDate] | @csv' \
  FoodData_Central_foundation_food_json_2025-04-24.json > /tmp/foundation.csv

sqlite3 usda_foods.db ".mode csv" ".import /tmp/foundation.csv foundation"

# Verify: should show 340
sqlite3 usda_foods.db "SELECT COUNT(*) FROM foundation;"
```

### Branded Foods Import (Large File)

The Branded Foods JSON is 3.1GB with this structure:
```json
{
  "BrandedFoods": [
    {
      "fdcId": 1106281,
      "description": "GRANOLA, CINNAMON, RAISIN",
      "brandOwner": "MICHELE'S",
      "brandedFoodCategory": "Cereal",
      "ingredients": "ORGANIC ROLLED OATS...",
      "servingSize": 28,
      "servingSizeUnit": "g",
      "householdServingFullText": "0.25 cup",
      "dataType": "Branded",
      "publicationDate": "11/13/2020"
    }
  ]
}
```

**Key insight**: Each item is on its own line in the file, allowing streaming.

File structure:
- Bytes 0-18: `{"BrandedFoods": [\n` (wrapper open)
- Bytes 19 to EOF-3: One JSON object per line, comma-separated
- Last 3 bytes: `]}\n` (wrapper close)

Import using streaming (avoids loading 3GB into memory):
```bash
# Create table
sqlite3 usda_foods.db 'CREATE TABLE branded (
  fdc_id INTEGER PRIMARY KEY,
  description TEXT,
  brand_owner TEXT,
  branded_food_category TEXT,
  ingredients TEXT,
  serving_size REAL,
  serving_size_unit TEXT,
  household_serving_text TEXT,
  data_type TEXT,
  publication_date TEXT
);'

# Stream JSON to CSV (skip wrapper bytes, strip trailing commas)
# tail -c +20 = skip first 19 bytes (wrapper open)
# head -c -3 = remove last 3 bytes (wrapper close)
# sed 's/,$//' = remove trailing comma from each line
tail -c +20 FoodData_Central_branded_food_json_2025-04-24.json \
  | head -c -3 \
  | sed 's/,$//' \
  | jq -r '[.fdcId, .description, .brandOwner, .brandedFoodCategory, .ingredients, .servingSize, .servingSizeUnit, .householdServingFullText, .dataType, .publicationDate] | @csv' \
  > /tmp/branded.csv

# Import CSV (takes ~30 seconds)
sqlite3 usda_foods.db ".mode csv" ".import /tmp/branded.csv branded"

# Verify: should show 452998
sqlite3 usda_foods.db "SELECT COUNT(*) FROM branded;"
```

## Useful Queries

```sql
-- SR Legacy categories with counts
SELECT food_category, COUNT(*) FROM sr_legacy
GROUP BY food_category ORDER BY COUNT(*) DESC;

-- Branded food categories with counts (352 categories)
SELECT branded_food_category, COUNT(*) as cnt FROM branded
GROUP BY branded_food_category ORDER BY cnt DESC;

-- Sample items from a category
SELECT description FROM sr_legacy
WHERE food_category = 'Dairy and Egg Products' LIMIT 20;

-- Search branded foods
SELECT description, brand_owner, branded_food_category
FROM branded WHERE description LIKE '%granola%' LIMIT 10;
```

## Category Mapping

The 352 branded food categories are mapped to 18 store aisle sections in `config/category-mapping.json`:

| Store Aisle | Example USDA Categories |
|-------------|------------------------|
| produce | Pre-Packaged Fruit & Vegetables |
| meat | Bacon, Sausages & Ribs; Pepperoni, Salami & Cold Cuts |
| seafood | Frozen Fish & Seafood; Canned Tuna |
| dairy | Cheese; Yogurt; Milk; Eggs & Egg Substitutes |
| deli | Deli Salads; Prepared Subs & Sandwiches |
| bakery | Breads & Buns; Cakes, Cupcakes, Snack Cakes |
| frozen | Ice Cream & Frozen Yogurt; Frozen Dinners & Entrees |
| canned | Canned Vegetables; Canned Soup; Tomatoes |
| pasta | Pasta by Shape & Type; Rice; All Noodles |
| breakfast | Cereal; Breakfast Sandwiches |
| snacks | Candy; Chips, Pretzels & Snacks; Cookies & Biscuits |
| beverages | Soda; Water; Fruit Juice; Coffee; Tea |
| condiments | Ketchup, Mustard, BBQ Sauce; Salad Dressing |
| baking | Flours & Corn Meal; Sugar; Baking Mixes |
| international | Mexican Dinner Mixes; Pizza |
| baby | Baby/Infant Foods/Beverages |
| health | Vitamins; Supplements; Meal Replacement |
| household | (non-food, added manually) |

## Generate Dictionary

```bash
node generate-dictionary.cjs
```

Output: `../../src/data/dictionaries/grocery.json`

## Current Status

**Dictionary**: 2,022 items across 18 categories (generated from SR Legacy data)

**Test Coverage**: 53 passing tests in `src/lib/categorization/__tests__/groceryDictionary.test.ts`

### Features
- Exact matching for common items (milk, bread, eggs, cheese, chicken, etc.)
- Plural/singular handling ("apples" -> "apple")
- Typo tolerance ("chiken" -> "chicken", "buter" -> "butter")
- Compound item matching ("ground beef", "cheddar cheese", "greek yogurt")
- Autocomplete support with length-based ranking
- Subcategory assignment (fruits, vegetables, poultry, beef, fish, etc.)

### Search Algorithm
Uses `fast-fuzzy` with:
1. **Exact match boosting**: Name match = 1.01, alias match = 1.0, fuzzy = original score
2. **O(1) length tiebreaking**: Prefer items whose name length is closest to query length

### Files
- `generate-dictionary.cjs` - Main generator script
- `test-categorizer.ts` - Interactive test script (`npx tsx test-categorizer.ts`)
- `config/category-mapping.json` - Maps USDA categories to store aisles
- `../../src/data/dictionaries/grocery.json` - Generated dictionary
- `../../src/lib/categorization/__tests__/groceryDictionary.test.ts` - Unit tests

### Future Expansion
The 452K branded foods database is available for future expansion if needed. This would add brand-specific items (Cheerios, Kraft, etc.) but increases complexity. Current dictionary covers 95%+ of typical grocery items.

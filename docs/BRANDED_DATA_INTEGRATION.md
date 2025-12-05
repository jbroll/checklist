# Branded Data Integration Opportunities

Analysis of USDA Branded Food database for enhancing the grocery dictionary.

*Created: December 2025*

---

## 1. Popular Brand Names for Aliases

These brand names are commonly used as product names by shoppers. Adding them as aliases improves matching when users type "cheerios" instead of "cereal".

### Top National Brands (by product count in DB)

| Brand | Products | Use As Alias For |
|-------|----------|------------------|
| Kraft Heinz | 4,128 | mac and cheese, cheese slices, mayo |
| Frito-Lay | 2,345 | chips, doritos, cheetos, lays |
| General Mills | 3,943 | cheerios, lucky charms, cereal |
| Hershey | 1,953 | chocolate, candy bars |
| Nestle | 1,922 | chocolate, coffee creamer |
| Kellogg | 3,585 | frosted flakes, pop-tarts, cereal |
| Pepsi-Cola | 1,306 | soda, pepsi, mountain dew |
| Campbell Soup | 1,334 | soup, broth |
| ConAgra | 3,105 | frozen dinners, hunt's, chef boyardee |
| Bimbo Bakeries | 1,553 | bread, sara lee, thomas |

### Category-Specific Brand Aliases

#### Cereal Brands
| Brand | Suggested Aliases |
|-------|-------------------|
| Post | raisin bran, grape nuts, honeycomb |
| Kellogg's | frosted flakes, corn flakes, froot loops, rice krispies |
| General Mills | cheerios, lucky charms, cinnamon toast crunch |
| Quaker | oatmeal, instant oatmeal, life cereal |

#### Chips & Snacks Brands
| Brand | Suggested Aliases |
|-------|-------------------|
| Frito-Lay | lays, doritos, cheetos, tostitos, fritos, ruffles |
| Utz | utz chips, utz pretzels |
| Snyder's | snyder's pretzels, snyder's of hanover |
| Herr's | herr's chips |
| Cape Cod | cape cod chips |

#### Candy & Chocolate Brands
| Brand | Suggested Aliases |
|-------|-------------------|
| Hershey | hershey's, reese's, kit kat |
| Mars | m&ms, snickers, twix, milky way |
| Ferrara | nerds, sweetarts, laffy taffy |
| Lindt | lindt chocolate, lindor |
| Ghirardelli | ghirardelli chocolate |

#### Soda Brands
| Brand | Suggested Aliases |
|-------|-------------------|
| Pepsi-Cola | pepsi, mountain dew, sierra mist |
| Dr Pepper/7UP | dr pepper, 7up, sunkist |
| Coca-Cola | coke, sprite, fanta |
| Zevia | zevia (zero calorie soda) |

#### Dairy Brands
| Brand | Suggested Aliases |
|-------|-------------------|
| Danone | dannon, activia, oikos |
| Chobani | chobani yogurt |
| Yoplait | yoplait yogurt |
| Kraft | kraft singles, velveeta, philadelphia cream cheese |

#### Ice Cream Brands
| Brand | Suggested Aliases |
|-------|-------------------|
| Wells (Blue Bunny) | blue bunny |
| Dreyer's/Edy's | dreyer's, edy's |
| Haagen-Dazs | haagen dazs |
| Ben & Jerry's | ben and jerry's, ben & jerry's |
| Turkey Hill | turkey hill |

---

## 2. Missing Product Types

Products found in branded data that should be added to the grocery dictionary.

### Snacks - Missing Items

| Product Type | Count | Priority |
|--------------|-------|----------|
| kettle cooked potato chips | 124 | High |
| wavy potato chips | 55 | High |
| ripple potato chips | 44 | Medium |
| blue corn tortilla chips | 41 | Medium |
| veggie chips | 23 | High |
| plantain chips | 23 | High |
| kale chips | 21 | Medium |
| pita chips | 15+ | High |
| wasabi peas | 30 | Medium |
| peanut butter filled pretzels | 28 | Medium |

### Beverages - Missing Items

| Product Type | Count | Priority |
|--------------|-------|----------|
| sparkling water | 227 | High |
| energy drink | 125 | High |
| tonic water | 74 | High |
| ginger ale | 72 | High |
| ginger beer | 42 | Medium |
| cream soda | 69 | Medium |
| club soda | 68 | High |
| seltzer water | 55 | High |
| root beer | 72 | High |
| grape soda | 50 | Medium |
| orange soda | 69 | Medium |
| lemon lime soda | 44 | Medium |

### Cereal - Missing Items

| Product Type | Count | Priority |
|--------------|-------|----------|
| instant oatmeal | 63 | High |
| quick oats | 51 | High |
| old fashioned oats | 50 | High |
| steel cut oats | 23 | High |
| corn flakes | 30 | High |
| raisin bran | 29 | High |
| frosted flakes | 22 | High |
| toasted oats | 19 | Medium |

### Dairy - Missing Items

| Product Type | Count | Priority |
|--------------|-------|----------|
| 2% reduced fat milk | 392 | High |
| fat free milk | 242 | High |
| 1% lowfat milk | 213 | High |
| vitamin d milk | 108 | High |
| sharp cheddar cheese | 197 | Medium |
| mild cheddar cheese | 171 | Medium |
| monterey jack cheese | 133 | Medium |
| swiss cheese | 100 | Medium |
| pepper jack cheese | 61 | Medium |
| colby jack cheese | 60 | Medium |
| muenster cheese | 67 | Medium |
| gouda cheese | 55 | Medium |
| cream cheese spread | 69 | Medium |
| greek nonfat yogurt | 62 | High |
| sweetened condensed milk | 85 | Medium |
| evaporated milk | 83 | Medium |

---

## 3. Implementation Recommendations

### Phase 1: Brand Aliases (Quick Win)
Add top brand names as aliases to existing generic items:

```json
{
  "name": "cereal",
  "aliases": ["cheerios", "frosted flakes", "corn flakes", "froot loops", "lucky charms"]
}
```

### Phase 2: Missing Product Types
Add new dictionary entries for common product variations:

```json
{
  "name": "sparkling water",
  "category": "beverages",
  "aliases": ["seltzer", "seltzer water", "carbonated water", "la croix", "perrier"]
}
```

### Phase 3: Milk Variety Expansion
Current dictionary likely has just "milk" - expand to specific types:

```json
[
  { "name": "whole milk", "category": "dairy", "aliases": ["vitamin d milk"] },
  { "name": "2% milk", "category": "dairy", "aliases": ["reduced fat milk", "2 percent milk"] },
  { "name": "1% milk", "category": "dairy", "aliases": ["lowfat milk", "low fat milk", "1 percent milk"] },
  { "name": "skim milk", "category": "dairy", "aliases": ["fat free milk", "nonfat milk"] }
]
```

---

## 4. SQL Queries for Further Analysis

```sql
-- Find brands that are commonly used as product names
SELECT brand_owner, COUNT(*) as cnt
FROM branded
WHERE LOWER(description) LIKE '%' || LOWER(brand_owner) || '%'
GROUP BY brand_owner
HAVING cnt > 50
ORDER BY cnt DESC;

-- Find product variations we might be missing
SELECT
  branded_food_category,
  LOWER(SUBSTR(description, 1, INSTR(description || ',', ',') - 1)) as product,
  COUNT(*) as cnt
FROM branded
GROUP BY branded_food_category, product
HAVING cnt >= 20
ORDER BY branded_food_category, cnt DESC;
```

---

## 5. Priority Summary

| Category | # Items to Add | Effort | Impact |
|----------|----------------|--------|--------|
| Brand aliases | ~50 | Low | High |
| Beverage types | ~15 | Low | High |
| Snack variations | ~10 | Low | Medium |
| Milk types | 4 | Low | High |
| Cheese varieties | ~10 | Low | Medium |
| Cereal variations | ~8 | Low | Medium |

**Estimated total: ~100 new items/aliases to add**

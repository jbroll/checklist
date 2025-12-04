# Domain Dictionary Building Methodology

A systematic, iterative approach to building categorization dictionaries for non-grocery domains.

*Created: December 2025*

---

## Overview

This document describes the methodology for building domain-specific dictionaries (hardware, packing, moving, camping) by analyzing real-world retailer category structures and iteratively populating items.

**Key Principles:**
1. **Retailer-driven categories** - Base structure on how major retailers organize products
2. **Generic product types, not SKUs** - Capture distinct products people shop for (types + sizes), not brand/color variants
3. **Sizes are products** - "1/2 inch PVC pipe" and "3/4 inch PVC pipe" are different shopping list items
4. **Iterative population** - Add items per category per iteration, scaled to category depth
5. **Coverage over completeness** - Aim for common items people actually buy
6. **Split large categories** - Keep categories manageable (target: 50-150 items max per subcategory)

---

## Phase 1: Retailer Inventory Analysis

### Step 1.0: Research Actual Inventory Counts (CRITICAL)

**Before creating category targets, research actual SKU counts at major retailers.** This grounds our estimates in reality rather than arbitrary guesses.

#### How to Research Inventory Counts

1. **Use retailer website search**: Visit category pages and note "X results" counts
2. **Check subcategory breakdowns**: Note how SKUs are distributed across subcategories
3. **Document your findings**: Record counts per category with source URLs

#### Example: Home Depot Inventory Research (December 2025)

| Category | Subcategory | SKU Count | Source |
|----------|-------------|-----------|--------|
| Fasteners | Screws (total) | 4,587 | homedepot.com/b/Hardware-Fasteners-Screws |
| Fasteners | Wood Screws | 989 | homedepot.com subcategory |
| Fasteners | Nails (total) | 492 | homedepot.com/b/Hardware-Fasteners-Nails |
| Electrical | Outlets & Receptacles | 405 | homedepot.com/b/Electrical... |
| Paint | Primers | 366 | homedepot.com/b/Paint-Primers |
| Paint | Paint & Primer in One | 1,277 | homedepot.com category |
| Tools | All tools (best rated) | 7,606 | homedepot.com/b/Tools |
| **Store Total** | In-store | ~35,000 | Industry reports |
| **Online Total** | homedepot.com | 500,000+ | 2012 company statement |

#### Key Insight: Generic Product Types vs. SKU Variations

Retailer SKUs include brand/color variations we don't need. However, **sizes ARE distinct products** that people specifically shop for.

**What creates a distinct dictionary entry:**
- ✅ **Different product types**: drywall screw vs. deck screw vs. pocket screw
- ✅ **Different sizes**: 1/2" PVC pipe vs. 3/4" PVC pipe vs. 1" PVC pipe
- ✅ **Different materials**: copper pipe vs. PVC pipe vs. PEX tubing
- ❌ **Different brands**: same product from different manufacturers
- ❌ **Different colors**: same product in different colors (unless color = material, like copper)

**Size-specific entries are critical** because people write shopping lists like:
- "1/2 inch PVC pipe" (not just "PVC pipe")
- "3/4 inch plywood" (not just "plywood")
- "#8 wood screws" (not just "wood screws")
- "12/2 romex" (not just "electrical wire")
- "2x4" (not just "lumber")

#### Sizing Taxonomy by Category

| Category | Size Dimensions | Common Sizes to Include |
|----------|-----------------|-------------------------|
| **Plumbing pipe** | Diameter | 1/2", 3/4", 1", 1-1/2", 2", 3", 4" |
| **Plumbing fittings** | Diameter | Same as pipe (must match) |
| **Lumber dimensional** | Cross-section | 2x4, 2x6, 2x8, 2x10, 2x12, 4x4, 1x4, 1x6, etc. |
| **Sheet goods** | Thickness | 1/4", 3/8", 1/2", 5/8", 3/4" |
| **Drywall** | Thickness | 1/4", 3/8", 1/2", 5/8" |
| **Electrical wire** | Gauge + conductors | 14/2, 14/3, 12/2, 12/3, 10/2, 10/3, 6/3 |
| **Conduit** | Diameter | 1/2", 3/4", 1" |
| **Screws** | Number size | #6, #8, #10, #12 |
| **Screws** | Length (for specific types) | 1", 1-1/4", 1-5/8", 2", 2-1/2", 3" |
| **Bolts/nuts/washers** | Diameter | 1/4", 5/16", 3/8", 1/2" |
| **Nails** | Penny size | 6d, 8d, 10d, 16d |

#### Dictionary Item Count Guidance

The goal is to capture **every distinct product type someone might put on a shopping list**, including size variations for products where size matters.

| Category Type | Approach | Example |
|---------------|----------|---------|
| **Size-critical** | Include common sizes as separate entries | "1/2 inch PVC pipe", "3/4 inch PVC pipe" |
| **Type-critical** | Include product types, sizes as aliases | "drywall screw" with alias "1-5/8 drywall screw" |
| **Generic** | Single entry with aliases | "paint brush" covers all sizes |

**Rough sizing guide:**
- Small category (one aisle section): 30-60 items
- Medium category (full aisle): 80-150 items
- Large category (multiple aisles): 150-250 items

---

## Phase 1.5: Category Target Setting

### Step 1.5.1: Create Inventory-Based Targets

After researching actual SKU counts, create realistic targets for each category:

```markdown
## Category Targets (Example: Hardware Domain)

### Based on Home Depot Inventory Research

| Category | HD SKU Count | Target Items | Justification |
|----------|-------------|--------------|---------------|
| Fasteners/Screws | 4,587 | 150-200 | Major aisle, 26+ screw types × varieties |
| Fasteners/Nails | 492 | 40-60 | Smaller than screws, fewer types |
| Fasteners/Bolts | ~2,000 | 80-100 | Many bolt types and sizes |
| Fasteners/Anchors | ~1,500 | 60-80 | Drywall, concrete, specialty |
| Electrical/Outlets | 405 | 30-50 | Fewer types, many are brand variants |
| Plumbing/Fittings | ~3,000 | 100-150 | PVC, copper, PEX, many fitting types |
| Paint/Products | ~2,000 | 60-100 | Interior, exterior, primer, stain |
| Tools/Hand | ~3,000 | 150-200 | Hammers, screwdrivers, pliers, etc. |
| Tools/Power | ~4,000 | 100-150 | Drills, saws, sanders, etc. |
```

### Step 1.5.2: Validate Targets

Cross-check targets against multiple retailers:
- If Lowe's shows similar counts, target is validated
- If counts differ significantly, investigate why (different categorization?)
- Adjust targets based on cross-retailer validation

---

## Phase 2: Retailer Category Analysis

### Step 1.1: Select Reference Retailers

Choose 3-5 major retailers in the domain that represent different market segments:

| Segment | Purpose |
|---------|---------|
| Big box / Mass market | Broadest category coverage |
| Specialty / Professional | Deeper product knowledge |
| Online leader | Modern categorization patterns |
| Regional / Alternative | Catch edge cases |

**Example for Hardware:**
- Home Depot (big box)
- Lowe's (big box, different organization)
- Ace Hardware (smaller format, curated)
- Amazon Hardware (online, comprehensive)
- Menards (regional, different perspective)

### Step 1.2: Extract Category Structures

For each retailer, document their top-level navigation/aisle structure:

```
Retailer: [Name]
Source: [Website navigation / Store map / App categories]
Date: [When captured]

Categories:
1. [Category Name] - [Brief description]
2. [Category Name] - [Brief description]
...
```

### Step 1.3: Synthesize Unified Categories

Compare retailer structures and create a unified category list:

1. Identify common categories across all retailers
2. Note category naming variations (map to canonical names)
3. Decide on granularity (when to merge vs. keep separate)
4. Create initial category hierarchy

**Output:** Initial category structure with 10-20 top-level categories

---

## Phase 2: Category Population (Iterative)

### Step 2.1: First Pass - Core Items

For each category, add the most common/essential items:

**Per iteration target:** 50-100 items per category

**Item selection criteria:**
1. Most frequently purchased items
2. Items that appear across multiple retailers
3. Generic terms (not brand-specific unless brand = generic name)
4. Include common variations/synonyms as aliases

**Item format:**
```json
{
  "name": "canonical name",
  "category": "category-id",
  "subcategory": "subcategory-id",
  "aliases": ["alternative name", "abbreviation", "regional term"],
  "unit": "default unit"
}
```

### Step 2.2: Evaluate Coverage

After each iteration, assess:

1. **Category size** - If > 150 items, consider splitting
2. **Coverage gaps** - What common items are missing?
3. **Balance** - Are some categories underpopulated?
4. **Alias quality** - Are common search terms covered?

### Step 2.3: Split Large Categories

When a category exceeds ~150 items:

1. Identify natural subcategory boundaries
2. Create subcategories that match retailer patterns
3. Redistribute items to subcategories
4. Continue iteration with finer granularity

**Splitting heuristics:**
- By material (wood screws vs. metal screws)
- By size/scale (hand tools vs. power tools)
- By application (interior paint vs. exterior paint)
- By room/location (bathroom fixtures vs. kitchen fixtures)

### Step 2.4: Iterate Until Sufficient

Continue iterations until:
- [ ] Each category has 50-150 items
- [ ] Common shopping list items are covered (test against real lists)
- [ ] Search hit rate > 80% on sample queries
- [ ] No obvious gaps in major product areas

---

## Phase 3: Validation

### Step 3.1: Real-World Testing

Test against actual shopping lists/project lists:
- Reddit communities (r/HomeImprovement, r/DIY, etc.)
- Project planning guides
- "What to buy" articles

**Target metrics:**
| Metric | Target |
|--------|--------|
| Item match rate | > 85% |
| Category accuracy | > 90% |
| Fuzzy match success | > 95% for typos |

### Step 3.2: Gap Analysis

Identify systematic gaps:
- Product types not covered
- Categories that need expansion
- Missing aliases/synonyms

### Step 3.3: Final Review

- Remove duplicates
- Verify all items have categories
- Check alias conflicts
- Validate JSON structure

---

## Domain-Specific Notes

### Hardware Domain

**Unique considerations:**
- Technical terminology varies (DIY vs. trade terms)
- **Sizes are critical** - most hardware items are purchased by specific size
- Brand-as-generic common (e.g., "Sheetrock", "WD-40", "Romex")
- Project-based shopping (buy related items together)
- Multiple notation systems (fractions vs. decimals, penny sizes, gauge numbers)

**Size-critical categories requiring separate entries per size:**
| Category | Why sizes matter | Example entries |
|----------|-----------------|-----------------|
| Plumbing pipe/fittings | Must match existing plumbing | "1/2 inch pvc pipe", "3/4 inch pvc pipe" |
| Dimensional lumber | Structural requirements | "2x4", "2x6", "4x4" |
| Sheet goods | Project specifications | "1/2 inch plywood", "3/4 inch plywood" |
| Electrical wire | Code requirements by circuit | "14/2 romex", "12/2 romex" |
| Fasteners | Load and material requirements | "#8 wood screw", "1/4 inch bolt" |

**Alias patterns for size notation:**
```json
{
  "name": "1/2 inch pvc pipe",
  "aliases": ["1/2\" pvc", "1/2 pvc", "half inch pvc", ".5 inch pvc"]
}
```

Common alias patterns:
- Fraction with quote: `1/2"`, `3/4"`
- Fraction without quote: `1/2`, `3/4`
- Written out: `half inch`, `three quarter inch`
- Decimal: `.5 inch`, `.75 inch`
- With/without spaces: `1/2 inch` vs `1/2inch`

**Key retailers:**
1. Home Depot
2. Lowe's
3. Ace Hardware
4. Amazon
5. Menards / True Value

### Packing/Travel Domain

**Unique considerations:**
- Trip-type specific (beach vs. business vs. camping)
- Gender-specific items in some categories
- Weather/destination dependent
- Size/quantity implicit (one swimsuit, multiple socks)

**Key sources:**
1. Travel blogs/guides
2. Packing list apps
3. Airline baggage guides
4. Reddit r/onebag, r/travel

### Moving Domain

**Unique considerations:**
- Room-based organization natural
- Supplies vs. contents distinction
- Furniture items
- Utility connection items

**Key sources:**
1. Moving company checklists
2. Real estate moving guides
3. Reddit r/moving
4. Storage unit companies

### Camping Domain

**Unique considerations:**
- Activity-specific gear (backpacking vs. car camping)
- Safety equipment critical
- Overlaps with travel/packing
- Technical gear terminology

**Key sources:**
1. REI
2. Cabela's / Bass Pro
3. Backcountry
4. Reddit r/camping, r/CampingGear

---

## Output Format

Each domain dictionary follows the same structure as grocery:

```json
{
  "domain": "hardware",
  "version": "1.0.0",
  "generatedAt": "2025-12-XX",
  "source": "Retailer analysis + manual curation",
  "license": "Original work",
  "categories": [
    {
      "id": "electrical",
      "name": "Electrical",
      "sortOrder": 1,
      "subcategories": [
        { "id": "wire", "name": "Wire & Cable", "sortOrder": 1 },
        { "id": "outlets", "name": "Outlets & Switches", "sortOrder": 2 }
      ]
    }
  ],
  "items": [
    {
      "name": "outlet cover",
      "category": "electrical",
      "subcategory": "outlets",
      "aliases": ["switch plate", "wall plate", "cover plate"],
      "unit": "piece"
    }
  ]
}
```

---

## Iteration Tracking Template

Use this template to track progress on each domain:

```markdown
## [Domain] Dictionary Progress

### Retailer Analysis
- [ ] Retailer 1: [Name] - Categories extracted
- [ ] Retailer 2: [Name] - Categories extracted
- [ ] Retailer 3: [Name] - Categories extracted
- [ ] Unified category structure created

### Category Population

| Category | Items | Status | Notes |
|----------|-------|--------|-------|
| category-1 | 0 | Not started | |
| category-2 | 0 | Not started | |

### Iterations
- [ ] Iteration 1: Core items (50-100 per category)
- [ ] Iteration 2: Expansion + alias improvement
- [ ] Iteration 3: Gap filling + validation
- [ ] Final review and cleanup

### Validation
- [ ] Real-world list testing
- [ ] Gap analysis complete
- [ ] JSON validation passed
```

---

## References

- [AUTO_CATEGORIZATION_DESIGN.md](./AUTO_CATEGORIZATION_DESIGN.md) - System architecture
- [GROCERY_DATABASE_STRATEGY.md](./GROCERY_DATABASE_STRATEGY.md) - Grocery implementation reference

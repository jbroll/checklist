# Indented List Format

## Overview

The **Indented List Format** is a new plain text format for importing and exporting hierarchical lists. It uses indentation (tabs or spaces) to represent category/item relationships.

## Features

- **Auto-detection**: The system automatically detects whether your `.txt` file is flat or indented
- **Flexible indentation**: Supports tabs, 2-space, 3-space, or 4-space indentation
- **Mixed indentation**: Can handle mixed tabs and spaces
- **Comments**: Lines starting with `#` are ignored
- **Blank lines**: Empty lines are ignored
- **Round-trip support**: Export preserves hierarchy when re-imported

## Format Rules

1. **Indentation creates hierarchy**
   - Items at the same indentation level are siblings
   - Indented items are children of the previous less-indented item

2. **Types are automatic**
   - Items with children → Categories
   - Items without children → Items (leaf nodes)

3. **Comments and blank lines**
   - Lines starting with `#` are comments (ignored)
   - Blank lines are ignored

## Examples

### Basic Two-Level Hierarchy

```
Produce
  Apples
  Bananas
  Oranges
Dairy
  Milk
  Cheese
```

**Result:**
- "Produce" → Category
  - "Apples" → Item
  - "Bananas" → Item
  - "Oranges" → Item
- "Dairy" → Category
  - "Milk" → Item
  - "Cheese" → Item

### Three-Level Hierarchy

```
Grocery Store
  Produce
    Fruits
      Apples
      Bananas
    Vegetables
      Carrots
      Broccoli
  Dairy
    Milk
    Cheese
```

**Result:**
- "Grocery Store" → Category
  - "Produce" → Category
    - "Fruits" → Category
      - "Apples" → Item
      - "Bananas" → Item
    - "Vegetables" → Category
      - "Carrots" → Item
      - "Broccoli" → Item
  - "Dairy" → Category
    - "Milk" → Item
    - "Cheese" → Item

### With Comments and Blank Lines

```
# My Shopping List

Produce
  # Fresh fruits
  Apples
  Bananas

Dairy
  Milk
  Cheese
```

### Mixed Root-Level Items

```
Category1
  Item1
  Item2
Item3
Item4
```

**Result:**
- "Category1" → Category
  - "Item1" → Item
  - "Item2" → Item
- "Item3" → Item (root level)
- "Item4" → Item (root level)

## Indentation Detection

The system automatically detects:

- **Tabs vs Spaces**: If any line starts with a tab, assumes tab indentation
- **Space count**: Finds the greatest common divisor of all indentation levels
- **Mixed indentation**: Normalizes mixed tabs/spaces

### Tab Indentation

```
Category1
→Item1
→Item2
```
(→ represents a tab character)

### 2-Space Indentation

```
Category1
  Item1
  Item2
```

### 4-Space Indentation

```
Category1
    Item1
    Item2
```

## Importing

1. **From Dashboard**: Click "Import" → Select `.txt` file
2. **Auto-detection**: System detects flat vs indented format
3. **Hierarchy**: Categories and items are created based on structure

## Exporting

1. **From Template**: Click "Export" → Select "TXT"
2. **Auto-format**:
   - If template has categories → Exports as indented format
   - If template has only items → Exports as flat format
3. **Indentation**: Uses 2-space indentation by default

## Tips

1. **Consistent indentation**: Use consistent spacing (all 2-space or all 4-space)
2. **Comments for organization**: Use `#` comments to document your lists
3. **Round-trip editing**: Export → Edit in text editor → Re-import

## Comparison with Other Formats

| Feature | Flat TXT | Indented TXT | CSV | JSON |
|---------|----------|--------------|-----|------|
| Hierarchy | ❌ | ✅ | ✅ | ✅ |
| Human-readable | ✅ | ✅ | ⚠️ | ❌ |
| Comments | ❌ | ✅ | ❌ | ❌ |
| Metadata | ❌ | ❌ | ✅ | ✅ |
| Quick editing | ✅ | ✅ | ⚠️ | ❌ |

## Technical Details

- **Path generation**: Paths are auto-generated from item names
- **Normalization**: Names are normalized to lowercase paths (e.g., "Fresh Fruits" → "fresh-fruits")
- **Duplicate detection**: Duplicate paths are skipped during import
- **Sort order**: Items maintain the order from the file

## Example Use Cases

1. **Quick list creation**: Type a hierarchical list in any text editor
2. **Sharing templates**: Share human-readable grocery templates
3. **Version control**: Store templates in Git with clear diffs
4. **Batch editing**: Edit multiple items quickly in your favorite editor

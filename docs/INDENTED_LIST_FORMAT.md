# Indented List Format

## Overview

The **Indented List Format** is a plain text format for importing and exporting hierarchical lists. It uses indentation (tabs or spaces) to represent category/item relationships.

## Features

- **Auto-detection**: The system automatically detects whether your `.txt` file is flat or indented
- **Flexible indentation**: Supports tabs, 2-space, 3-space, or 4-space indentation
- **Mixed indentation**: Can handle mixed tabs and spaces
- **Comments**: Lines starting with `#` are ignored
- **Metadata**: Comments with `# key: value` format can specify list name and description
- **Blank lines**: Empty lines are ignored
- **Round-trip support**: Export preserves hierarchy when re-imported

## Format Rules

1. **Indentation creates hierarchy**
   - Items at the same indentation level are siblings
   - Indented items are children of the previous less-indented item

2. **Types are automatic**
   - Items with children become categories
   - Items without children become leaf items

3. **Comments and blank lines**
   - Lines starting with `#` are comments (ignored for items)
   - Blank lines are ignored

4. **Metadata in comments**
   - Use `# key: value` format to specify metadata
   - `# name:` sets the list name on import
   - `# description:` sets an optional description

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
- "Produce" becomes a category
  - "Apples", "Bananas", "Oranges" become items
- "Dairy" becomes a category
  - "Milk", "Cheese" become items

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

### With Comments

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

### With Metadata

```
# name: Weekly Groceries
# description: Standard weekly shopping list

Produce
  Apples
  Bananas
Dairy
  Milk
  Cheese
```

When imported, this creates a list named "Weekly Groceries" instead of using the filename.

## Indentation Detection

The system automatically detects:

- **Tabs vs Spaces**: If any line starts with a tab, assumes tab indentation
- **Space count**: Finds the greatest common divisor of all indentation levels
- **Mixed indentation**: Normalizes mixed tabs/spaces

## Tips

1. **Consistent indentation**: Use consistent spacing (all 2-space or all 4-space)
2. **Comments for organization**: Use `#` comments to document your lists
3. **Use metadata for names**: Add `# name: My List` to set the list name on import
4. **Round-trip editing**: Export, edit in text editor, re-import

## Comparison with Other Formats

| Feature | Flat TXT | Indented TXT | CSV | JSON |
|---------|----------|--------------|-----|------|
| Hierarchy | No | Yes | Yes | Yes |
| Human-readable | Yes | Yes | Somewhat | No |
| Comments | No | Yes | No | No |
| Metadata | No | Yes | No | Yes |
| Quick editing | Yes | Yes | Somewhat | No |

## Technical Details

- **Path generation**: Paths are auto-generated from item names
- **Normalization**: Names are normalized to lowercase paths (e.g., "Fresh Fruits" -> "fresh-fruits")
- **Duplicate detection**: Duplicate paths are skipped during import
- **Sort order**: Items maintain the order from the file

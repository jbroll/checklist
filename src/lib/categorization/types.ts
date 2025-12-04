/**
 * Auto-categorization system types
 */

// Domain identifiers
export type DomainId = 'grocery' | 'hardware' | 'packing' | 'moving' | 'camping';

// Category definition from dictionary
export interface Category {
  id: string;
  name: string;
  subcategories?: Subcategory[];
  sortOrder: number;
}

export interface Subcategory {
  id: string;
  name: string;
  sortOrder: number;
}

// Item definition in dictionary JSON
export interface DictionaryItem {
  name: string; // Canonical name: "ground beef"
  category: string; // Category ID: "meat"
  subcategory?: string; // Subcategory ID: "beef"
  aliases?: string[]; // Alternative names: ["hamburger meat", "minced beef"]
  unit?: string; // Default unit: "lb"
}

// Dictionary file format (JSON)
export interface DictionaryFile {
  domain: DomainId;
  version: string;
  generatedAt: string;
  source: string;
  license: string;
  categories: Category[];
  items: DictionaryItem[];
}

// Skip-lists for token classification
export interface SkipListsFile {
  version: string;
  units: UnitDefinition[];
  sizes: string[];
  modifiers: string[];
  brands: string[];
  quantityWords: string[]; // "one", "two", "dozen", etc.
}

export interface UnitDefinition {
  canonical: string; // "pound"
  variations: string[]; // ["lb", "lbs", "pound", "pounds"]
  category: 'weight' | 'volume' | 'count' | 'length';
}

// Token classification
export type TokenType = 'QUANTITY' | 'UNIT' | 'SIZE' | 'MODIFIER' | 'BRAND' | 'ITEM';

export interface ClassifiedToken {
  value: string;
  type: TokenType;
  original: string; // Original casing/form
}

// Parsed quantity from input
export interface ParsedQuantity {
  value: number;
  unit?: string; // Original unit text
  unitCanonical?: string; // Normalized unit: "pound"
}

// Preprocessor output
export interface PreprocessedInput {
  original: string;
  normalized: string;
  tokens: ClassifiedToken[];
  quantity?: ParsedQuantity;
  modifiers: string[];
  searchTerms: string; // What to send to fast-fuzzy
}

// Categorization result
export interface CategorizationResult {
  originalInput: string;
  item: string; // Canonical item name or cleaned input
  category?: string; // Category ID
  categoryName?: string; // Category display name
  subcategory?: string; // Subcategory ID
  subcategoryName?: string; // Subcategory display name
  quantity?: ParsedQuantity;
  modifiers: string[];
  confidence: number; // 0-1
  source: 'dictionary' | 'user' | 'none';
}

// Suggestion for autocomplete
export interface Suggestion {
  text: string;
  category: string;
  categoryName: string;
  subcategory?: string;
  subcategoryName?: string;
  score: number;
}

// Domain configuration (runtime)
export interface DomainConfig {
  id: DomainId;
  name: string;
  categories: Category[];
  categoryMap: Map<string, Category>; // Quick lookup by ID
}

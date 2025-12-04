/**
 * Input preprocessor for auto-categorization
 *
 * Handles:
 * - Text normalization (case, whitespace, unicode)
 * - Tokenization
 * - Token classification (quantity, unit, modifier, item)
 * - Quantity extraction
 */

import type {
  ClassifiedToken,
  ParsedQuantity,
  PreprocessedInput,
  SkipListsFile,
  UnitDefinition,
} from './types';

// Number word to value mapping
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  quarter: 0.25,
  couple: 2,
  few: 3,
  several: 4,
  some: 2,
  dozen: 12,
};

/**
 * Preprocessor class that handles token classification
 */
export class Preprocessor {
  private unitMap: Map<string, UnitDefinition>;
  private sizeSet: Set<string>;
  private modifierSet: Set<string>;
  private brandSet: Set<string>;

  constructor(skipLists: SkipListsFile) {
    // Build unit lookup map (variation -> definition)
    this.unitMap = new Map();
    for (const unit of skipLists.units) {
      for (const variation of unit.variations) {
        this.unitMap.set(variation.toLowerCase(), unit);
      }
    }

    // Build sets for O(1) lookup
    this.sizeSet = new Set(skipLists.sizes.map((s) => s.toLowerCase()));
    this.modifierSet = new Set(skipLists.modifiers.map((m) => m.toLowerCase()));
    this.brandSet = new Set(skipLists.brands.map((b) => b.toLowerCase()));
    // Note: quantityWords are handled via NUMBER_WORDS constant
  }

  /**
   * Main preprocessing entry point
   */
  preprocess(input: string): PreprocessedInput {
    const original = input;
    const normalized = this.normalize(input);
    const rawTokens = this.tokenize(normalized, original);
    const { tokens, quantity } = this.classifyTokens(rawTokens);

    // Extract modifiers and build search terms
    const modifiers: string[] = [];
    const itemTokens: string[] = [];

    for (const token of tokens) {
      if (token.type === 'MODIFIER') {
        modifiers.push(token.value);
      } else if (token.type === 'ITEM') {
        itemTokens.push(token.value);
      }
    }

    const searchTerms = itemTokens.join(' ');

    return {
      original,
      normalized,
      tokens,
      quantity,
      modifiers,
      searchTerms,
    };
  }

  /**
   * Normalize input text
   */
  private normalize(input: string): string {
    return (
      input
        // Trim whitespace
        .trim()
        // Normalize unicode (NFD decomposition, remove diacritics)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Lowercase
        .toLowerCase()
        // Normalize whitespace (collapse multiple spaces)
        .replace(/\s+/g, ' ')
        // Keep hyphens in compound words, remove other punctuation except numbers
        .replace(/[^\w\s\-./]/g, '')
    );
  }

  /**
   * Split input into tokens, preserving original forms
   */
  private tokenize(
    normalized: string,
    original: string,
  ): Array<{ value: string; original: string }> {
    const normalizedParts = normalized.split(/\s+/).filter((p) => p.length > 0);
    const originalParts = original.split(/\s+/).filter((p) => p.length > 0);

    // Map normalized tokens to original forms
    return normalizedParts.map((value, i) => ({
      value,
      original: originalParts[i] || value,
    }));
  }

  /**
   * Classify each token and extract quantity
   */
  private classifyTokens(rawTokens: Array<{ value: string; original: string }>): {
    tokens: ClassifiedToken[];
    quantity?: ParsedQuantity;
  } {
    const tokens: ClassifiedToken[] = [];
    let quantity: ParsedQuantity | undefined;
    let i = 0;

    while (i < rawTokens.length) {
      const { value, original } = rawTokens[i];
      const nextToken = rawTokens[i + 1];

      // Check for quantity (number or number word)
      const numericValue = this.parseQuantityToken(value);
      if (numericValue !== null) {
        // Check if next token is a unit
        const unitDef = nextToken ? this.unitMap.get(nextToken.value) : undefined;
        if (unitDef) {
          quantity = {
            value: numericValue,
            unit: nextToken.original,
            unitCanonical: unitDef.canonical,
          };
          tokens.push({
            value,
            original,
            type: 'QUANTITY',
          });
          tokens.push({
            value: nextToken.value,
            original: nextToken.original,
            type: 'UNIT',
          });
          i += 2;
          continue;
        }

        // Standalone quantity (no unit)
        quantity = { value: numericValue };
        tokens.push({
          value,
          original,
          type: 'QUANTITY',
        });
        i++;
        continue;
      }

      // Check for standalone unit (rare, but possible)
      if (this.unitMap.has(value)) {
        tokens.push({
          value,
          original,
          type: 'UNIT',
        });
        i++;
        continue;
      }

      // Check for size
      if (this.sizeSet.has(value)) {
        tokens.push({
          value,
          original,
          type: 'SIZE',
        });
        i++;
        continue;
      }

      // Check for modifier
      if (this.modifierSet.has(value)) {
        tokens.push({
          value,
          original,
          type: 'MODIFIER',
        });
        i++;
        continue;
      }

      // Check for brand
      if (this.brandSet.has(value)) {
        tokens.push({
          value,
          original,
          type: 'BRAND',
        });
        i++;
        continue;
      }

      // Default to ITEM
      tokens.push({
        value,
        original,
        type: 'ITEM',
      });
      i++;
    }

    return { tokens, quantity };
  }

  /**
   * Try to parse a token as a quantity value
   * Returns null if not a quantity
   */
  private parseQuantityToken(token: string): number | null {
    // Check for number word
    if (token in NUMBER_WORDS) {
      return NUMBER_WORDS[token];
    }

    // Check for numeric value (including decimals and fractions)
    // Match: "2", "2.5", "1/2", "1/4"
    if (/^\d+(\.\d+)?$/.test(token)) {
      return Number.parseFloat(token);
    }

    // Match fractions like "1/2", "3/4"
    const fractionMatch = token.match(/^(\d+)\/(\d+)$/);
    if (fractionMatch) {
      const numerator = Number.parseInt(fractionMatch[1], 10);
      const denominator = Number.parseInt(fractionMatch[2], 10);
      if (denominator !== 0) {
        return numerator / denominator;
      }
    }

    return null;
  }
}

/**
 * Create a preprocessor from skip-lists JSON data
 */
export function createPreprocessor(skipLists: SkipListsFile): Preprocessor {
  return new Preprocessor(skipLists);
}

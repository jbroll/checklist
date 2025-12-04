/**
 * Auto-categorization system for Bubblelist
 *
 * Provides local-first, dictionary-based categorization for items
 * using fast-fuzzy for fuzzy matching.
 *
 * @example
 * ```typescript
 * import { initCategorization, categorize, suggest } from '@/lib/categorization';
 *
 * // Initialize (load dictionary and skip-lists)
 * await initCategorization('grocery');
 *
 * // Categorize an item
 * const result = categorize('2 lb organic ground beef', 'grocery');
 * // → { item: 'ground beef', category: 'meat', subcategory: 'beef',
 * //    quantity: { value: 2, unit: 'lb' }, modifiers: ['organic'], ... }
 *
 * // Get suggestions as user types
 * const suggestions = suggest('gro', 'grocery');
 * // → [{ text: 'ground beef', category: 'meat', ... }, ...]
 * ```
 */

// Re-export from categorizer
export type { CategorizeOptions } from './categorizer';

// Re-export from domain loader
export {
  clearDomainCache,
  getAvailableDomains,
  getCategory,
  getDomain,
  getDomainInfo,
  isDomainLoaded,
  loadDomain,
  loadDomainFromData,
  searchDomain,
} from './domainLoader';
// Re-export preprocessor
export { createPreprocessor, Preprocessor } from './preprocessor';
// Re-export types
export type {
  CategorizationResult,
  Category,
  DictionaryFile,
  DictionaryItem,
  DomainConfig,
  DomainId,
  ParsedQuantity,
  PreprocessedInput,
  SkipListsFile,
  Subcategory,
  Suggestion,
} from './types';
// Re-export React hook
export { useCategorization } from './useCategorization';

import { categorize as categorizeFn, suggest as suggestFn } from './categorizer';
import { isDomainLoaded, loadDomain } from './domainLoader';
import { Preprocessor } from './preprocessor';
import type { CategorizationResult, DomainId, SkipListsFile, Suggestion } from './types';

// Module-level preprocessor instance
let preprocessor: Preprocessor | null = null;

/**
 * Initialize the categorization system
 *
 * Must be called before categorize() or suggest().
 * Loads the skip-lists and optionally pre-loads a domain.
 */
export async function initCategorization(preloadDomain?: DomainId): Promise<void> {
  // Load skip-lists
  if (!preprocessor) {
    const skipListsModule = await import('../../data/dictionaries/skip-lists.json');
    const skipLists = skipListsModule.default as SkipListsFile;
    preprocessor = new Preprocessor(skipLists);
  }

  // Optionally pre-load a domain
  if (preloadDomain && !isDomainLoaded(preloadDomain)) {
    await loadDomain(preloadDomain);
  }
}

/**
 * Ensure the system is initialized
 */
function ensureInitialized(): Preprocessor {
  if (!preprocessor) {
    throw new Error('Categorization not initialized. Call initCategorization() first.');
  }
  return preprocessor;
}

/**
 * Categorize an item input string
 *
 * @param input - Raw user input (e.g., "2 lb organic ground beef")
 * @param domainId - Domain to search (e.g., "grocery")
 * @param options - Optional settings
 * @returns Categorization result with item, category, quantity, etc.
 */
export function categorize(
  input: string,
  domainId: DomainId,
  options?: {
    userOverrides?: Map<string, { categoryId: string; subcategoryId?: string }>;
  },
): CategorizationResult {
  const prep = ensureInitialized();

  // Ensure domain is loaded
  if (!isDomainLoaded(domainId)) {
    throw new Error(
      `Domain "${domainId}" not loaded. Call loadDomain() or initCategorization('${domainId}') first.`,
    );
  }

  return categorizeFn(input, domainId, prep, options);
}

/**
 * Get suggestions for autocomplete as user types
 *
 * @param partialInput - Partial input text
 * @param domainId - Domain to search
 * @param limit - Maximum suggestions to return (default 5)
 * @returns Array of suggestions with text, category, and score
 */
export function suggest(partialInput: string, domainId: DomainId, limit = 5): Suggestion[] {
  const prep = ensureInitialized();

  // Ensure domain is loaded
  if (!isDomainLoaded(domainId)) {
    throw new Error(
      `Domain "${domainId}" not loaded. Call loadDomain() or initCategorization('${domainId}') first.`,
    );
  }

  return suggestFn(partialInput, domainId, prep, limit);
}

/**
 * Preprocess input without categorizing
 *
 * Useful for extracting quantity, modifiers, etc. without doing a search.
 */
export function preprocess(input: string) {
  const prep = ensureInitialized();
  return prep.preprocess(input);
}

/**
 * Main categorization logic
 *
 * Combines preprocessing and domain search to categorize items
 */

import { getCategory, type SearchResult, searchDomain } from './domainLoader';
import type { Preprocessor } from './preprocessor';
import type { CategorizationResult, DomainId, PreprocessedInput, Suggestion } from './types';

/**
 * Options for categorization
 */
export interface CategorizeOptions {
  /** Include alternative matches in result */
  includeAlternatives?: boolean;
  /** User overrides to check first (item name -> category ID) */
  userOverrides?: Map<string, { categoryId: string; subcategoryId?: string }>;
}

/**
 * Categorize an item input string
 */
export function categorize(
  input: string,
  domainId: DomainId,
  preprocessor: Preprocessor,
  options: CategorizeOptions = {},
): CategorizationResult {
  // 1. Preprocess the input
  const processed = preprocessor.preprocess(input);

  // 2. If no search terms, return early
  if (!processed.searchTerms.trim()) {
    return createEmptyResult(processed);
  }

  // 3. Check user overrides first
  if (options.userOverrides) {
    const override = findUserOverride(processed.searchTerms, options.userOverrides);
    if (override) {
      return createResultFromOverride(processed, domainId, override);
    }
  }

  // 4. Search the domain dictionary
  const searchResults = searchDomain(domainId, processed.searchTerms, 5);

  // 5. No matches found
  if (searchResults.length === 0) {
    return createEmptyResult(processed);
  }

  // 6. Build result from best match
  const bestMatch = searchResults[0];
  return createResultFromMatch(processed, domainId, bestMatch);
}

/**
 * Get suggestions for autocomplete
 */
export function suggest(
  partialInput: string,
  domainId: DomainId,
  preprocessor: Preprocessor,
  limit = 5,
): Suggestion[] {
  // Preprocess to extract search terms
  const processed = preprocessor.preprocess(partialInput);

  if (!processed.searchTerms.trim()) {
    return [];
  }

  // Search domain
  const searchResults = searchDomain(domainId, processed.searchTerms, limit);

  // Format as suggestions
  return searchResults.map((result) => {
    const category = getCategory(domainId, result.item.category);
    const subcategory = result.item.subcategory
      ? category?.subcategories?.find((s) => s.id === result.item.subcategory)
      : undefined;

    return {
      text: result.item.name,
      category: result.item.category,
      categoryName: category?.name || result.item.category,
      subcategory: result.item.subcategory,
      subcategoryName: subcategory?.name,
      score: result.score,
    };
  });
}

/**
 * Find a user override for the given search terms
 */
function findUserOverride(
  searchTerms: string,
  overrides: Map<string, { categoryId: string; subcategoryId?: string }>,
): { categoryId: string; subcategoryId?: string } | undefined {
  // Normalize search terms for lookup
  const normalized = searchTerms.toLowerCase().trim();
  return overrides.get(normalized);
}

/**
 * Create result from a user override
 */
function createResultFromOverride(
  processed: PreprocessedInput,
  domainId: DomainId,
  override: { categoryId: string; subcategoryId?: string },
): CategorizationResult {
  const category = getCategory(domainId, override.categoryId);
  const subcategory = override.subcategoryId
    ? category?.subcategories?.find((s) => s.id === override.subcategoryId)
    : undefined;

  return {
    originalInput: processed.original,
    item: processed.searchTerms,
    category: override.categoryId,
    categoryName: category?.name || override.categoryId,
    subcategory: override.subcategoryId,
    subcategoryName: subcategory?.name,
    quantity: processed.quantity,
    modifiers: processed.modifiers,
    confidence: 1.0,
    source: 'user',
  };
}

/**
 * Create result from a dictionary match
 */
function createResultFromMatch(
  processed: PreprocessedInput,
  domainId: DomainId,
  match: SearchResult,
): CategorizationResult {
  const category = getCategory(domainId, match.item.category);
  const subcategory = match.item.subcategory
    ? category?.subcategories?.find((s) => s.id === match.item.subcategory)
    : undefined;

  return {
    originalInput: processed.original,
    item: match.item.name,
    category: match.item.category,
    categoryName: category?.name || match.item.category,
    subcategory: match.item.subcategory,
    subcategoryName: subcategory?.name,
    quantity: processed.quantity,
    modifiers: processed.modifiers,
    confidence: match.score,
    source: 'dictionary',
  };
}

/**
 * Create empty result when no match found
 */
function createEmptyResult(processed: PreprocessedInput): CategorizationResult {
  return {
    originalInput: processed.original,
    item: processed.searchTerms || processed.original,
    category: undefined,
    categoryName: undefined,
    subcategory: undefined,
    subcategoryName: undefined,
    quantity: processed.quantity,
    modifiers: processed.modifiers,
    confidence: 0,
    source: 'none',
  };
}

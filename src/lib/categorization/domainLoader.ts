/**
 * Domain loader for auto-categorization
 *
 * Handles:
 * - Loading dictionary JSON files
 * - Creating fast-fuzzy Searcher instances
 * - Caching loaded domains
 */

import { Searcher } from 'fast-fuzzy';
import type { Category, DictionaryFile, DictionaryItem, DomainConfig, DomainId } from './types';

// Cached domain configurations
const domainCache = new Map<DomainId, LoadedDomain>();

// Searcher options type for our use case
type SearcherOptions = {
  keySelector: (item: DictionaryItem & { searchTerms: string }) => string;
  threshold: number;
  ignoreCase: boolean;
  ignoreSymbols: boolean;
  normalizeWhitespace: boolean;
  returnMatchData: true;
};

/**
 * Internal representation of a loaded domain with Searcher
 */
interface LoadedDomain extends DomainConfig {
  searcher: Searcher<DictionaryItem & { searchTerms: string }, SearcherOptions>;
  items: DictionaryItem[];
}

/**
 * Search result from fast-fuzzy with match data
 */
export interface SearchResult {
  item: DictionaryItem;
  original: string;
  score: number;
}

/**
 * Load a domain from its dictionary file
 */
export async function loadDomain(domainId: DomainId): Promise<void> {
  if (domainCache.has(domainId)) {
    return; // Already loaded
  }

  const dictionary = await loadDictionaryFile(domainId);
  const domain = createDomainFromDictionary(dictionary);
  domainCache.set(domainId, domain);
}

/**
 * Load dictionary JSON file for a domain
 */
async function loadDictionaryFile(domainId: DomainId): Promise<DictionaryFile> {
  // Dynamic import of JSON file
  // In production, these would be in src/data/dictionaries/
  const dictionaryModule = await import(`../../data/dictionaries/${domainId}.json`);
  return dictionaryModule.default as DictionaryFile;
}

/**
 * Create domain configuration from dictionary data
 */
function createDomainFromDictionary(dictionary: DictionaryFile): LoadedDomain {
  // Build category map for quick lookup
  const categoryMap = new Map<string, Category>();
  for (const category of dictionary.categories) {
    categoryMap.set(category.id, category);
  }

  // Prepare items for fast-fuzzy
  // Add searchTerms field combining name and aliases
  const itemsWithSearchTerms = dictionary.items.map((item) => ({
    ...item,
    searchTerms: [item.name, ...(item.aliases || [])].join(' '),
  }));

  // Create fast-fuzzy Searcher
  const searcher = new Searcher(itemsWithSearchTerms, {
    keySelector: (item) => item.searchTerms,
    threshold: 0.6,
    ignoreCase: true,
    ignoreSymbols: true,
    normalizeWhitespace: true,
    returnMatchData: true,
  });

  return {
    id: dictionary.domain,
    name: getDomainDisplayName(dictionary.domain),
    categories: dictionary.categories,
    categoryMap,
    searcher,
    items: dictionary.items,
  };
}

/**
 * Get display name for a domain ID
 */
function getDomainDisplayName(domainId: DomainId): string {
  const names: Record<DomainId, string> = {
    grocery: 'Grocery Store',
    hardware: 'Hardware Store',
    packing: 'Packing / Travel',
    moving: 'Moving',
    camping: 'Camping',
  };
  return names[domainId] || domainId;
}

/**
 * Get a loaded domain by ID
 * Throws if domain not loaded
 */
export function getDomain(domainId: DomainId): LoadedDomain {
  const domain = domainCache.get(domainId);
  if (!domain) {
    throw new Error(`Domain "${domainId}" not loaded. Call loadDomain() first.`);
  }
  return domain;
}

/**
 * Check if a domain is loaded
 */
export function isDomainLoaded(domainId: DomainId): boolean {
  return domainCache.has(domainId);
}

/**
 * Get all available domain IDs
 */
export function getAvailableDomains(): DomainId[] {
  return ['grocery', 'hardware', 'packing', 'moving', 'camping'];
}

/**
 * Get domain info for all domains (loaded or not)
 */
export function getDomainInfo(): Array<{
  id: DomainId;
  name: string;
  loaded: boolean;
}> {
  return getAvailableDomains().map((id) => ({
    id,
    name: getDomainDisplayName(id),
    loaded: isDomainLoaded(id),
  }));
}

/**
 * Search for items in a loaded domain
 * Uses exact match boosting and length-based tiebreaking for better results
 */
export function searchDomain(domainId: DomainId, query: string, limit = 10): SearchResult[] {
  const domain = getDomain(domainId);
  const queryLower = query.toLowerCase().trim();

  // fast-fuzzy returns results with match data when returnMatchData is true
  const results = domain.searcher.search(query) as unknown as Array<{
    item: DictionaryItem & { searchTerms: string; allTerms?: string[] };
    original: string;
    score: number;
  }>;

  // Apply exact match boosting and length-based tiebreaking
  return results
    .map((result) => {
      const nameLower = result.item.name.toLowerCase();
      const allTerms = [nameLower, ...(result.item.aliases || []).map((a) => a.toLowerCase())];

      // Priority scoring: exact name = 1.01, exact alias = 1.0, fuzzy = original score
      let boostedScore = result.score;
      if (nameLower === queryLower) {
        boostedScore = 1.01; // Exact name match - highest priority
      } else if (allTerms.includes(queryLower)) {
        boostedScore = 1.0; // Exact alias match - second priority
      }

      // O(1) tiebreaker: prefer items whose name length is closest to query length
      const lengthDiff = Math.abs(result.item.name.length - queryLower.length);

      return {
        item: result.item,
        original: result.original,
        score: boostedScore,
        lengthDiff,
      };
    })
    .sort((a, b) => {
      // Primary: higher score first
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: smaller length difference first
      return a.lengthDiff - b.lengthDiff;
    })
    .slice(0, limit)
    .map(({ item, original, score }) => ({ item, original, score }));
}

/**
 * Get category by ID from a loaded domain
 */
export function getCategory(domainId: DomainId, categoryId: string): Category | undefined {
  const domain = getDomain(domainId);
  return domain.categoryMap.get(categoryId);
}

/**
 * Clear cached domains (useful for testing)
 */
export function clearDomainCache(): void {
  domainCache.clear();
}

/**
 * Load domain directly from dictionary data (for testing)
 */
export function loadDomainFromData(dictionary: DictionaryFile): void {
  const domain = createDomainFromDictionary(dictionary);
  domainCache.set(dictionary.domain, domain);
}

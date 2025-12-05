/**
 * Domain loader for auto-categorization
 *
 * Architecture:
 * - DomainCatalog: Raw domain data (items, categories) loaded from JSON
 * - CachedSearcher: A fast-fuzzy Searcher built from one or more catalogs
 * - LRU Cache: Holds up to 3 searchers, evicting least recently used
 *
 * Keys in the cache:
 * - Single domain: 'grocery', 'hardware', etc.
 * - Combined domains: 'grocery+hardware' (sorted alphabetically)
 */

import { Searcher } from 'fast-fuzzy';
import type {
  AutocompleteDomain,
  Category,
  DictionaryFile,
  DictionaryItem,
  DomainId,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Raw catalog data loaded from a domain's JSON file
 */
export interface DomainCatalog {
  domainId: DomainId;
  displayName: string;
  items: DictionaryItem[];
  categories: Category[];
  categoryMap: Map<string, Category>;
}

/**
 * Item with search metadata, ready for indexing
 */
interface IndexedItem extends DictionaryItem {
  domain: DomainId;
  searchTerms: string;
}

/**
 * Searcher options type for fast-fuzzy
 */
type SearcherOptions = {
  keySelector: (item: IndexedItem) => string;
  threshold: number;
  ignoreCase: boolean;
  ignoreSymbols: boolean;
  normalizeWhitespace: boolean;
  returnMatchData: true;
};

/**
 * Cached searcher with metadata
 */
interface CachedSearcher {
  searcher: Searcher<IndexedItem, SearcherOptions>;
  domainIds: DomainId[];
  catalogs: DomainCatalog[];
}

/**
 * Search result from fast-fuzzy with match data
 */
export interface SearchResult {
  item: DictionaryItem & { domain: DomainId };
  original: string;
  score: number;
}

// =============================================================================
// State
// =============================================================================

// Raw catalog data cache (never evicted - small footprint)
const catalogCache = new Map<DomainId, DomainCatalog>();

// LRU cache for searchers (max 3 entries)
const LRU_MAX_SIZE = 3;
const searcherCache = new Map<string, CachedSearcher>();
const searcherAccessOrder: string[] = []; // Most recent at end

// =============================================================================
// Domain Display Names
// =============================================================================

const DOMAIN_DISPLAY_NAMES: Record<DomainId, string> = {
  grocery: 'Grocery',
  hardware: 'Hardware',
  outdoor: 'Outdoor',
  packing: 'Packing',
  moving: 'Moving',
  camping: 'Camping',
};

/**
 * Get display name for a domain ID
 */
export function getDomainDisplayName(domainId: DomainId): string {
  return DOMAIN_DISPLAY_NAMES[domainId] || domainId;
}

// =============================================================================
// Catalog Loading
// =============================================================================

/**
 * Get list of domains that have dictionary files implemented
 */
export function getImplementedDomains(): DomainId[] {
  return ['grocery', 'hardware', 'outdoor'];
}

/**
 * Load a domain catalog from its JSON file
 */
async function loadCatalog(domainId: DomainId): Promise<DomainCatalog> {
  // Check cache first
  const cached = catalogCache.get(domainId);
  if (cached) return cached;

  // Dynamic import of JSON file
  const dictionaryModule = await import(`../../data/dictionaries/${domainId}.json`);
  const dictionary = dictionaryModule.default as DictionaryFile;

  // Build category map for quick lookup
  const categoryMap = new Map<string, Category>();
  for (const category of dictionary.categories) {
    categoryMap.set(category.id, category);
  }

  const catalog: DomainCatalog = {
    domainId: dictionary.domain,
    displayName: getDomainDisplayName(dictionary.domain),
    items: dictionary.items,
    categories: dictionary.categories,
    categoryMap,
  };

  catalogCache.set(domainId, catalog);
  return catalog;
}

/**
 * Load multiple domain catalogs
 */
async function loadCatalogs(domainIds: DomainId[]): Promise<DomainCatalog[]> {
  return Promise.all(domainIds.map(loadCatalog));
}

// =============================================================================
// LRU Cache Management
// =============================================================================

/**
 * Generate cache key from domain IDs (sorted for consistency)
 */
function getCacheKey(domainIds: DomainId[]): string {
  return [...domainIds].sort().join('+');
}

/**
 * Touch a cache entry (move to most recently used)
 */
function touchCacheEntry(key: string): void {
  const index = searcherAccessOrder.indexOf(key);
  if (index !== -1) {
    searcherAccessOrder.splice(index, 1);
  }
  searcherAccessOrder.push(key);
}

/**
 * Evict least recently used entry if over capacity
 */
function evictIfNeeded(): void {
  while (searcherCache.size >= LRU_MAX_SIZE && searcherAccessOrder.length > 0) {
    const lruKey = searcherAccessOrder.shift();
    if (lruKey) {
      searcherCache.delete(lruKey);
    }
  }
}

// =============================================================================
// Searcher Building
// =============================================================================

/**
 * Build a searcher from an array of domain catalogs
 */
function buildSearcher(catalogs: DomainCatalog[]): Searcher<IndexedItem, SearcherOptions> {
  // Flatten items from all catalogs, tagging each with its source domain
  const allItems: IndexedItem[] = catalogs.flatMap((catalog) =>
    catalog.items.map((item) => ({
      ...item,
      domain: catalog.domainId,
      searchTerms: [item.name, ...(item.aliases || [])].join(' '),
    })),
  );

  return new Searcher(allItems, {
    keySelector: (item) => item.searchTerms,
    threshold: 0.6,
    ignoreCase: true,
    ignoreSymbols: true,
    normalizeWhitespace: true,
    returnMatchData: true,
  });
}

/**
 * Get or create a cached searcher for the specified domains
 */
async function getSearcher(domainIds: DomainId[]): Promise<CachedSearcher> {
  const key = getCacheKey(domainIds);

  // Check cache
  const cached = searcherCache.get(key);
  if (cached) {
    touchCacheEntry(key);
    return cached;
  }

  // Load catalogs and build searcher
  const catalogs = await loadCatalogs(domainIds);
  const searcher = buildSearcher(catalogs);

  const entry: CachedSearcher = {
    searcher,
    domainIds,
    catalogs,
  };

  // Evict LRU if needed, then cache
  evictIfNeeded();
  searcherCache.set(key, entry);
  touchCacheEntry(key);

  return entry;
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search with a specific autocomplete domain setting
 * Handles 'none', single domains, and 'all'
 */
export async function searchWithDomain(
  autocompleteDomain: AutocompleteDomain,
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  // Handle 'none' - no autocomplete
  if (autocompleteDomain === 'none') {
    return [];
  }

  // Determine which domains to search
  const domainIds: DomainId[] =
    autocompleteDomain === 'all' ? getImplementedDomains() : [autocompleteDomain];

  const { searcher } = await getSearcher(domainIds);
  return executeSearch(searcher, query, limit);
}

/**
 * Execute a search with exact match boosting and length-based tiebreaking
 */
function executeSearch(
  searcher: Searcher<IndexedItem, SearcherOptions>,
  query: string,
  limit: number,
): SearchResult[] {
  const queryLower = query.toLowerCase().trim();

  const results = searcher.search(query) as unknown as Array<{
    item: IndexedItem;
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

      // Tiebreaker: prefer items whose name length is closest to query length
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
    .map(({ item, original, score }) => ({
      item: { ...item, domain: item.domain },
      original,
      score,
    }));
}

// =============================================================================
// Synchronous API (for pre-loaded domains)
// =============================================================================

/**
 * Search a single domain synchronously (requires domain to be pre-loaded)
 * Used by categorizer.ts which expects synchronous operation
 */
export function searchDomainSync(domainId: DomainId, query: string, limit = 10): SearchResult[] {
  const catalog = catalogCache.get(domainId);
  if (!catalog) {
    throw new Error(`Domain "${domainId}" not loaded. Call loadDomain() first.`);
  }

  // Check if we have a cached searcher for this domain
  const key = getCacheKey([domainId]);
  let cached = searcherCache.get(key);

  if (!cached) {
    // Build searcher synchronously (catalog already loaded)
    const searcher = buildSearcher([catalog]);
    cached = { searcher, domainIds: [domainId], catalogs: [catalog] };
    evictIfNeeded();
    searcherCache.set(key, cached);
  }

  touchCacheEntry(key);
  return executeSearch(cached.searcher, query, limit);
}

/**
 * Get category by ID from a pre-loaded domain synchronously
 */
export function getCategorySync(domainId: DomainId, categoryId: string): Category | undefined {
  const catalog = catalogCache.get(domainId);
  if (!catalog) {
    throw new Error(`Domain "${domainId}" not loaded. Call loadDomain() first.`);
  }
  return catalog.categoryMap.get(categoryId);
}

// =============================================================================
// Legacy API (for backward compatibility)
// =============================================================================

/**
 * Load a domain (ensures catalog is cached)
 */
export async function loadDomain(domainId: DomainId): Promise<void> {
  await loadCatalog(domainId);
}

/**
 * Check if a domain catalog is loaded
 */
export function isDomainLoaded(domainId: DomainId): boolean {
  return catalogCache.has(domainId);
}

/**
 * Search a single domain (async version)
 * For sync usage with pre-loaded domains, use searchDomainSync
 */
export async function searchDomain(
  domainId: DomainId,
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  return searchWithDomain(domainId, query, limit);
}

/**
 * Get a loaded domain's catalog
 */
export function getDomainCatalog(domainId: DomainId): DomainCatalog | undefined {
  return catalogCache.get(domainId);
}

/**
 * Get category by ID from a domain (async version)
 * For sync usage with pre-loaded domains, use getCategorySync
 */
export async function getCategory(
  domainId: DomainId,
  categoryId: string,
): Promise<Category | undefined> {
  const catalog = await loadCatalog(domainId);
  return catalog.categoryMap.get(categoryId);
}

/**
 * Get all available domain IDs (including unimplemented)
 */
export function getAvailableDomains(): DomainId[] {
  return ['grocery', 'hardware', 'outdoor', 'packing', 'moving', 'camping'];
}

/**
 * Get domain info for all domains
 */
export function getDomainInfo(): Array<{
  id: DomainId;
  name: string;
  implemented: boolean;
  loaded: boolean;
}> {
  const implemented = new Set(getImplementedDomains());
  return getAvailableDomains().map((id) => ({
    id,
    name: getDomainDisplayName(id),
    implemented: implemented.has(id),
    loaded: catalogCache.has(id),
  }));
}

// =============================================================================
// Cache Management (for testing)
// =============================================================================

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  catalogCache.clear();
  searcherCache.clear();
  searcherAccessOrder.length = 0;
}

/**
 * Clear domain cache (alias for clearAllCaches for backward compatibility)
 */
export function clearDomainCache(): void {
  clearAllCaches();
}

/**
 * Load domain data directly from a dictionary object (for testing)
 */
export function loadDomainFromData(dictionary: DictionaryFile): void {
  // Build category map
  const categoryMap = new Map<string, Category>();
  for (const category of dictionary.categories) {
    categoryMap.set(category.id, category);
  }

  const catalog: DomainCatalog = {
    domainId: dictionary.domain,
    displayName: getDomainDisplayName(dictionary.domain),
    items: dictionary.items,
    categories: dictionary.categories,
    categoryMap,
  };

  catalogCache.set(dictionary.domain, catalog);
}

/**
 * Get current cache stats (for debugging)
 */
export function getCacheStats(): {
  catalogCount: number;
  searcherCount: number;
  searcherKeys: string[];
} {
  return {
    catalogCount: catalogCache.size,
    searcherCount: searcherCache.size,
    searcherKeys: [...searcherCache.keys()],
  };
}

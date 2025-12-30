/**
 * Unit tests for domain loader and LRU cache
 *
 * Tests caching behavior, LRU eviction, and multi-domain searchers.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllCaches,
  getCacheStats,
  getCategory,
  getDomainCatalog,
  getDomainDisplayName,
  getDomainInfo,
  getImplementedDomains,
  isDomainLoaded,
  loadDomain,
  loadDomainFromData,
  searchDomainSync,
  searchWithDomain,
} from './domainLoader';
import type { DictionaryFile } from './types';

// Test dictionary data
const createTestDictionary = (
  domain: string,
  items: Array<{ name: string; category: string }>,
): DictionaryFile => ({
  domain: domain as any,
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  items: items.map((item, i) => ({
    name: item.name,
    category: item.category,
    sortOrder: i,
  })),
  categories: [...new Set(items.map((i) => i.category))].map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    sortOrder: 0,
  })),
});

describe('domainLoader', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  describe('getDomainDisplayName', () => {
    it('returns display name for known domains', () => {
      expect(getDomainDisplayName('grocery')).toBe('Grocery');
      expect(getDomainDisplayName('hardware')).toBe('Hardware');
      expect(getDomainDisplayName('outdoor')).toBe('Outdoor');
    });

    it('returns domain ID for unknown domains', () => {
      expect(getDomainDisplayName('unknown' as any)).toBe('unknown');
    });
  });

  describe('getImplementedDomains', () => {
    it('returns list of implemented domains', () => {
      const domains = getImplementedDomains();
      expect(domains).toContain('grocery');
      expect(domains).toContain('hardware');
      expect(domains).toContain('outdoor');
    });
  });

  describe('getDomainInfo', () => {
    it('includes all available domains', () => {
      const info = getDomainInfo();
      const ids = info.map((d) => d.id);

      expect(ids).toContain('grocery');
      expect(ids).toContain('hardware');
      expect(ids).toContain('outdoor');
      expect(ids).toContain('packing');
      expect(ids).toContain('moving');
      expect(ids).toContain('camping');
    });

    it('marks implemented domains correctly', () => {
      const info = getDomainInfo();
      const grocery = info.find((d) => d.id === 'grocery');
      const packing = info.find((d) => d.id === 'packing');

      expect(grocery?.implemented).toBe(true);
      expect(packing?.implemented).toBe(false);
    });

    it('marks loaded domains correctly', () => {
      const infoBefore = getDomainInfo();
      const groceryBefore = infoBefore.find((d) => d.id === 'grocery');
      expect(groceryBefore?.loaded).toBe(false);
    });
  });

  describe('loadDomainFromData', () => {
    it('loads dictionary into catalog cache', () => {
      const testDict = createTestDictionary('grocery', [
        { name: 'milk', category: 'dairy' },
        { name: 'bread', category: 'bakery' },
      ]);

      loadDomainFromData(testDict);

      expect(isDomainLoaded('grocery')).toBe(true);
      expect(getCacheStats().catalogCount).toBe(1);
    });

    it('allows synchrous search after loading', () => {
      const testDict = createTestDictionary('grocery', [
        { name: 'milk', category: 'dairy' },
        { name: 'bread', category: 'bakery' },
        { name: 'banana', category: 'produce' },
      ]);

      loadDomainFromData(testDict);

      const results = searchDomainSync('grocery', 'milk');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.name).toBe('milk');
    });
  });

  describe('getCacheStats', () => {
    it('returns initial empty stats', () => {
      const stats = getCacheStats();
      expect(stats.catalogCount).toBe(0);
      expect(stats.searcherCount).toBe(0);
      expect(stats.searcherKeys).toEqual([]);
    });

    it('tracks catalog and searcher counts', () => {
      const testDict = createTestDictionary('grocery', [{ name: 'milk', category: 'dairy' }]);

      loadDomainFromData(testDict);
      expect(getCacheStats().catalogCount).toBe(1);

      // Create a searcher
      searchDomainSync('grocery', 'milk');
      expect(getCacheStats().searcherCount).toBe(1);
      expect(getCacheStats().searcherKeys).toContain('grocery');
    });
  });

  describe('LRU cache eviction', () => {
    it('evicts least recently used searcher when cache is full', () => {
      // Create 4 domains (cache max is 3)
      const domains = ['grocery', 'hardware', 'outdoor', 'packing'] as const;

      for (const domain of domains) {
        const testDict = createTestDictionary(domain, [
          { name: `${domain}-item`, category: 'test' },
        ]);
        loadDomainFromData(testDict);
      }

      // Create searchers for first 3 domains
      searchDomainSync('grocery', 'item');
      searchDomainSync('hardware', 'item');
      searchDomainSync('outdoor', 'item');

      expect(getCacheStats().searcherCount).toBe(3);
      expect(getCacheStats().searcherKeys).toContain('grocery');

      // Create 4th searcher - should evict grocery (LRU)
      searchDomainSync('packing', 'item');

      expect(getCacheStats().searcherCount).toBe(3);
      expect(getCacheStats().searcherKeys).not.toContain('grocery');
      expect(getCacheStats().searcherKeys).toContain('packing');
    });

    it('refreshes LRU order on access', () => {
      const domains = ['grocery', 'hardware', 'outdoor', 'packing'] as const;

      for (const domain of domains) {
        const testDict = createTestDictionary(domain, [
          { name: `${domain}-item`, category: 'test' },
        ]);
        loadDomainFromData(testDict);
      }

      // Create searchers in order: grocery, hardware, outdoor
      searchDomainSync('grocery', 'item');
      searchDomainSync('hardware', 'item');
      searchDomainSync('outdoor', 'item');

      // Access grocery again (moves to most recently used)
      searchDomainSync('grocery', 'item');

      // Create 4th searcher - should evict hardware (now LRU)
      searchDomainSync('packing', 'item');

      expect(getCacheStats().searcherCount).toBe(3);
      expect(getCacheStats().searcherKeys).toContain('grocery'); // Still there (refreshed)
      expect(getCacheStats().searcherKeys).not.toContain('hardware'); // Evicted
    });
  });

  describe('clearAllCaches', () => {
    it('clears all cached data', () => {
      const testDict = createTestDictionary('grocery', [{ name: 'milk', category: 'dairy' }]);

      loadDomainFromData(testDict);
      searchDomainSync('grocery', 'milk');

      expect(getCacheStats().catalogCount).toBe(1);
      expect(getCacheStats().searcherCount).toBe(1);

      clearAllCaches();

      expect(getCacheStats().catalogCount).toBe(0);
      expect(getCacheStats().searcherCount).toBe(0);
      expect(isDomainLoaded('grocery')).toBe(false);
    });
  });

  describe('getDomainCatalog', () => {
    it('returns undefined for unloaded domain', () => {
      expect(getDomainCatalog('grocery')).toBeUndefined();
    });

    it('returns catalog for loaded domain', () => {
      const testDict = createTestDictionary('grocery', [{ name: 'milk', category: 'dairy' }]);

      loadDomainFromData(testDict);

      const catalog = getDomainCatalog('grocery');
      expect(catalog).toBeDefined();
      expect(catalog?.domainId).toBe('grocery');
      expect(catalog?.items).toHaveLength(1);
    });
  });

  describe('searchDomainSync', () => {
    it('throws error for unloaded domain', () => {
      expect(() => searchDomainSync('grocery', 'milk')).toThrow('Domain "grocery" not loaded');
    });

    it('returns matching items', () => {
      const testDict = createTestDictionary('grocery', [
        { name: 'milk', category: 'dairy' },
        { name: 'milkshake', category: 'dairy' },
        { name: 'bread', category: 'bakery' },
      ]);

      loadDomainFromData(testDict);

      const results = searchDomainSync('grocery', 'milk');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.item.name.includes('milk'))).toBe(true);
    });

    it('respects limit parameter', () => {
      const testDict = createTestDictionary('grocery', [
        { name: 'apple', category: 'produce' },
        { name: 'apricot', category: 'produce' },
        { name: 'avocado', category: 'produce' },
        { name: 'artichoke', category: 'produce' },
        { name: 'asparagus', category: 'produce' },
      ]);

      loadDomainFromData(testDict);

      const results = searchDomainSync('grocery', 'a', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('boosts exact matches', () => {
      const testDict = createTestDictionary('grocery', [
        { name: 'banana', category: 'produce' },
        { name: 'bananas', category: 'produce' },
        { name: 'banana bread', category: 'bakery' },
      ]);

      loadDomainFromData(testDict);

      const results = searchDomainSync('grocery', 'banana');
      expect(results[0].item.name).toBe('banana');
    });
  });

  describe('searchWithDomain', () => {
    it('returns empty array for "none" domain', async () => {
      const results = await searchWithDomain('none', 'milk');
      expect(results).toEqual([]);
    });
  });
});

describe('loadDomain (async)', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  it('loads domain from JSON file', async () => {
    await loadDomain('grocery');
    expect(isDomainLoaded('grocery')).toBe(true);
  });

  it('can get category after loading', async () => {
    await loadDomain('grocery');
    const category = await getCategory('grocery', 'dairy');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Dairy');
  });
});

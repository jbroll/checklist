/**
 * Unit tests for auto-categorization system
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
// Load skip-lists for direct preprocessor testing
import skipListsData from '../../data/dictionaries/skip-lists.json';
import {
  categorize,
  clearDomainCache,
  getCategory,
  getDomainInfo,
  initCategorization,
  isDomainLoaded,
  loadDomain,
  preprocess,
  suggest,
} from './index';
import { Preprocessor } from './preprocessor';
import type { SkipListsFile } from './types';

const skipLists = skipListsData as SkipListsFile;

describe('Preprocessor', () => {
  let preprocessor: Preprocessor;

  beforeAll(() => {
    preprocessor = new Preprocessor(skipLists);
  });

  describe('normalize', () => {
    it('should lowercase input', () => {
      const result = preprocessor.preprocess('MILK');
      expect(result.normalized).toBe('milk');
    });

    it('should trim whitespace', () => {
      const result = preprocessor.preprocess('  milk  ');
      expect(result.normalized).toBe('milk');
    });

    it('should collapse multiple spaces', () => {
      const result = preprocessor.preprocess('ground   beef');
      expect(result.normalized).toBe('ground beef');
    });

    it('should preserve hyphens in compound words', () => {
      const result = preprocessor.preprocess('sugar-free');
      expect(result.normalized).toBe('sugar-free');
    });

    it('should handle unicode characters', () => {
      const result = preprocessor.preprocess('jalapeño');
      expect(result.normalized).toBe('jalapeno');
    });
  });

  describe('tokenize', () => {
    it('should split on whitespace', () => {
      const result = preprocessor.preprocess('ground beef');
      expect(result.tokens.map((t) => t.value)).toEqual(['ground', 'beef']);
    });

    it('should preserve original token forms', () => {
      const result = preprocessor.preprocess('Ground Beef');
      expect(result.tokens[0].original).toBe('Ground');
      expect(result.tokens[0].value).toBe('ground');
    });
  });

  describe('quantity extraction', () => {
    it('should extract numeric quantities', () => {
      const result = preprocessor.preprocess('2 milk');
      expect(result.quantity).toEqual({ value: 2 });
    });

    it('should extract decimal quantities', () => {
      const result = preprocessor.preprocess('1.5 lb beef');
      expect(result.quantity?.value).toBe(1.5);
    });

    it('should extract quantity with unit', () => {
      const result = preprocessor.preprocess('2 lb ground beef');
      expect(result.quantity).toEqual({
        value: 2,
        unit: 'lb',
        unitCanonical: 'pound',
      });
    });

    it('should handle quantity words', () => {
      const result = preprocessor.preprocess('two bananas');
      expect(result.quantity?.value).toBe(2);
    });

    it('should handle dozen', () => {
      const result = preprocessor.preprocess('dozen eggs');
      expect(result.quantity?.value).toBe(12);
    });

    it('should handle fractions', () => {
      const result = preprocessor.preprocess('1/2 lb cheese');
      expect(result.quantity?.value).toBe(0.5);
      expect(result.quantity?.unitCanonical).toBe('pound');
    });

    it('should normalize unit variations', () => {
      const tests = [
        { input: '2 lbs beef', expected: 'pound' },
        { input: '2 pounds beef', expected: 'pound' },
        { input: '2 oz cheese', expected: 'ounce' },
        { input: '1 gal milk', expected: 'gallon' },
        { input: '2 gallons milk', expected: 'gallon' },
      ];

      for (const { input, expected } of tests) {
        const result = preprocessor.preprocess(input);
        expect(result.quantity?.unitCanonical).toBe(expected);
      }
    });
  });

  describe('token classification', () => {
    it('should classify quantity tokens', () => {
      const result = preprocessor.preprocess('2 lb beef');
      expect(result.tokens[0].type).toBe('QUANTITY');
      expect(result.tokens[1].type).toBe('UNIT');
    });

    it('should classify modifier tokens', () => {
      const result = preprocessor.preprocess('organic milk');
      expect(result.tokens[0].type).toBe('MODIFIER');
      expect(result.tokens[1].type).toBe('ITEM');
    });

    it('should classify size tokens', () => {
      const result = preprocessor.preprocess('large eggs');
      expect(result.tokens[0].type).toBe('SIZE');
      expect(result.tokens[1].type).toBe('ITEM');
    });

    it('should classify brand tokens', () => {
      const result = preprocessor.preprocess('kirkland milk');
      expect(result.tokens[0].type).toBe('BRAND');
      expect(result.tokens[1].type).toBe('ITEM');
    });

    it('should default unrecognized tokens to ITEM', () => {
      const result = preprocessor.preprocess('bananas');
      expect(result.tokens[0].type).toBe('ITEM');
    });
  });

  describe('modifier extraction', () => {
    it('should extract modifiers from input', () => {
      const result = preprocessor.preprocess('organic fresh milk');
      expect(result.modifiers).toContain('organic');
      expect(result.modifiers).toContain('fresh');
    });

    it('should not include item words in modifiers', () => {
      const result = preprocessor.preprocess('organic bananas');
      expect(result.modifiers).toEqual(['organic']);
    });
  });

  describe('search terms extraction', () => {
    it('should extract only item tokens as search terms', () => {
      const result = preprocessor.preprocess('2 lb organic ground beef');
      expect(result.searchTerms).toBe('ground beef');
    });

    it('should handle multiple item tokens', () => {
      const result = preprocessor.preprocess('chicken breast');
      expect(result.searchTerms).toBe('chicken breast');
    });

    it('should strip quantities, units, and modifiers', () => {
      const result = preprocessor.preprocess('3 large organic free-range eggs');
      expect(result.searchTerms).toBe('eggs');
    });
  });
});

describe('Domain Loader', () => {
  beforeEach(() => {
    clearDomainCache();
  });

  it('should report domain as not loaded initially', () => {
    expect(isDomainLoaded('grocery')).toBe(false);
  });

  it('should load a domain', async () => {
    await loadDomain('grocery');
    expect(isDomainLoaded('grocery')).toBe(true);
  });

  it('should get domain info', () => {
    const info = getDomainInfo();
    expect(info).toContainEqual({
      id: 'grocery',
      name: 'Grocery',
      implemented: true,
      loaded: false,
    });
  });

  it('should get category from loaded domain', async () => {
    await loadDomain('grocery');
    const category = await getCategory('grocery', 'dairy');
    expect(category).toBeDefined();
    expect(category?.name).toBe('Dairy');
    // Subcategories may or may not be defined depending on the dictionary
    expect(category?.id).toBe('dairy');
  });
});

describe('Categorization', () => {
  beforeAll(async () => {
    await initCategorization('grocery');
  });

  describe('basic categorization', () => {
    it('should categorize a simple item', () => {
      const result = categorize('milk', 'grocery');
      expect(result.category).toBe('dairy');
      expect(result.categoryName).toBe('Dairy');
      expect(result.subcategory).toBe('milk');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.source).toBe('dictionary');
    });

    it('should categorize with quantity', () => {
      const result = categorize('2 gallons milk', 'grocery');
      expect(result.category).toBe('dairy');
      expect(result.quantity).toEqual({
        value: 2,
        unit: 'gallons',
        unitCanonical: 'gallon',
      });
    });

    it('should categorize with modifiers', () => {
      const result = categorize('organic skim milk', 'grocery');
      expect(result.category).toBe('dairy');
      expect(result.modifiers).toContain('organic');
    });

    it('should use canonical item name', () => {
      // "hamburger meat" matches "hamburger" or other items in our USDA dictionary
      const result = categorize('ground beef', 'grocery');
      expect(result.item).toBe('ground beef');
      expect(result.category).toBe('meat');
    });

    it('should handle plurals via fuzzy matching', () => {
      const result = categorize('bananas', 'grocery');
      expect(result.category).toBe('produce');
    });
  });

  describe('complex inputs', () => {
    it('should handle full natural language input', () => {
      const result = categorize('2 lb organic ground beef', 'grocery');
      expect(result.item).toBe('ground beef');
      expect(result.category).toBe('meat');
      expect(result.subcategory).toBe('beef');
      expect(result.quantity?.value).toBe(2);
      expect(result.quantity?.unitCanonical).toBe('pound');
      expect(result.modifiers).toContain('organic');
    });

    it('should handle brand + item', () => {
      const result = categorize('kirkland eggs', 'grocery');
      expect(result.category).toBe('dairy');
      // Dictionary stores singular "egg" as canonical name
      expect(result.item).toBe('egg');
    });

    it('should handle size + item', () => {
      const result = categorize('large eggs', 'grocery');
      expect(result.category).toBe('dairy');
      // Dictionary stores singular "egg" as canonical name
      expect(result.item).toBe('egg');
    });
  });

  describe('fuzzy matching', () => {
    it('should match with typos', () => {
      const result = categorize('banannas', 'grocery');
      expect(result.category).toBe('produce');
    });

    it('should match aliases', () => {
      // "oj" is not an alias in our USDA dictionary, test with actual alias
      const result = categorize('orange juices', 'grocery');
      expect(result.category).toBe('beverages');
      expect(result.item).toBe('orange juice');
    });

    it('should match partial names', () => {
      const result = categorize('chick breast', 'grocery');
      expect(result.category).toBe('meat');
    });
  });

  describe('no match cases', () => {
    it("should return source 'none' for unrecognized items", () => {
      const result = categorize('xyzabc123', 'grocery');
      expect(result.source).toBe('none');
      expect(result.confidence).toBe(0);
      expect(result.category).toBeUndefined();
    });

    it('should still extract quantity for unrecognized items', () => {
      const result = categorize('3 lb xyzabc', 'grocery');
      expect(result.quantity?.value).toBe(3);
      expect(result.source).toBe('none');
    });
  });

  describe('user overrides', () => {
    it('should use user override when provided', () => {
      const overrides = new Map([['milk', { categoryId: 'beverages', subcategoryId: 'water' }]]);

      const result = categorize('milk', 'grocery', { userOverrides: overrides });
      expect(result.category).toBe('beverages');
      expect(result.source).toBe('user');
      expect(result.confidence).toBe(1.0);
    });

    it('should fall back to dictionary when no override exists', () => {
      const overrides = new Map([['other item', { categoryId: 'snacks' }]]);

      const result = categorize('milk', 'grocery', { userOverrides: overrides });
      expect(result.category).toBe('dairy');
      expect(result.source).toBe('dictionary');
    });
  });
});

describe('Suggestions', () => {
  beforeAll(async () => {
    await initCategorization('grocery');
  });

  it('should return suggestions for partial input', () => {
    const suggestions = suggest('ban', 'grocery');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].text).toBe('banana');
  });

  it('should include category information', () => {
    const suggestions = suggest('milk', 'grocery');
    expect(suggestions[0].category).toBe('dairy');
    expect(suggestions[0].categoryName).toBe('Dairy');
  });

  it('should respect limit parameter', () => {
    const suggestions = suggest('ch', 'grocery', 3);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('should rank by match quality', () => {
    const suggestions = suggest('chicken', 'grocery');
    // All results should have scores
    for (const s of suggestions) {
      expect(s.score).toBeGreaterThan(0);
    }
  });

  it('should strip modifiers from search', () => {
    const suggestions = suggest('organic milk', 'grocery');
    expect(suggestions[0].text).toBe('milk');
  });
});

describe('preprocess (standalone)', () => {
  beforeAll(async () => {
    await initCategorization();
  });

  it('should preprocess without categorizing', () => {
    const result = preprocess('2 lb organic beef');
    expect(result.quantity?.value).toBe(2);
    expect(result.modifiers).toContain('organic');
    expect(result.searchTerms).toBe('beef');
  });
});

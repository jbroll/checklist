import { describe, expect, it } from 'vitest';
import { compareBySortMode } from './sortPreference';

describe('compareBySortMode', () => {
  it('sorts alphabetically when mode is alphabetical, ignoring sortOrder', () => {
    const a = { name: 'Oranges', sortOrder: 1 };
    const b = { name: 'Apples', sortOrder: 2 };

    expect(compareBySortMode(a, b, 'alphabetical')).toBeGreaterThan(0);
    expect(compareBySortMode(b, a, 'alphabetical')).toBeLessThan(0);
  });

  it('sorts by sortOrder then name when mode is manual', () => {
    const a = { name: 'Oranges', sortOrder: 1 };
    const b = { name: 'Apples', sortOrder: 2 };

    expect(compareBySortMode(a, b, 'manual')).toBeLessThan(0);
  });
});

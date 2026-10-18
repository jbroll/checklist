import { describe, expect, it } from 'vitest';
import { compareBySortMode, getStoredSortMode } from './sortPreference';

describe('compareBySortMode', () => {
  it('sorts A-Z when mode is ascending, ignoring sortOrder', () => {
    const a = { name: 'Oranges', sortOrder: 1 };
    const b = { name: 'Apples', sortOrder: 2 };

    expect(compareBySortMode(a, b, 'ascending')).toBeGreaterThan(0);
    expect(compareBySortMode(b, a, 'ascending')).toBeLessThan(0);
  });

  it('sorts Z-A when mode is descending, ignoring sortOrder', () => {
    const a = { name: 'Oranges', sortOrder: 1 };
    const b = { name: 'Apples', sortOrder: 2 };

    expect(compareBySortMode(a, b, 'descending')).toBeLessThan(0);
    expect(compareBySortMode(b, a, 'descending')).toBeGreaterThan(0);
  });

  it('sorts by sortOrder then name when mode is manual', () => {
    const a = { name: 'Oranges', sortOrder: 1 };
    const b = { name: 'Apples', sortOrder: 2 };

    expect(compareBySortMode(a, b, 'manual')).toBeLessThan(0);
  });
});

describe('getStoredSortMode', () => {
  it('reads a legacy alphabetical stored value as ascending', () => {
    localStorage.setItem('checklist-sort-mode', 'alphabetical');
    expect(getStoredSortMode()).toBe('ascending');
    localStorage.removeItem('checklist-sort-mode');
  });

  it('defaults to manual for unknown stored values', () => {
    localStorage.setItem('checklist-sort-mode', 'nonsense');
    expect(getStoredSortMode()).toBe('manual');
    localStorage.removeItem('checklist-sort-mode');
  });
});

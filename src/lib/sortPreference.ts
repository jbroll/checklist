import { useCallback, useState } from 'react';

export type SortMode = 'manual' | 'alphabetical';

const SORT_MODE_STORAGE_KEY = 'checklist-sort-mode';

export function getStoredSortMode(): SortMode {
  if (typeof window === 'undefined') return 'manual';
  const stored = localStorage.getItem(SORT_MODE_STORAGE_KEY);
  return stored === 'alphabetical' ? 'alphabetical' : 'manual';
}

export function compareBySortMode(
  a: { name: string; sortOrder: number },
  b: { name: string; sortOrder: number },
  mode: SortMode,
): number {
  if (mode === 'alphabetical') return a.name.localeCompare(b.name);
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

export function useSortMode(): { sortMode: SortMode; setSortMode: (m: SortMode) => void } {
  const [sortMode, setSortModeState] = useState<SortMode>(getStoredSortMode);

  const setSortMode = useCallback((mode: SortMode) => {
    setSortModeState(mode);
    localStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
  }, []);

  return { sortMode, setSortMode };
}

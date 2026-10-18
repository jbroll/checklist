import { useCallback, useState } from 'react';

export type SortMode = 'manual' | 'ascending' | 'descending';

const SORT_MODE_STORAGE_KEY = 'checklist-sort-mode';

export function getStoredSortMode(): SortMode {
  if (typeof window === 'undefined') return 'manual';
  const stored = localStorage.getItem(SORT_MODE_STORAGE_KEY);
  if (stored === 'ascending' || stored === 'alphabetical') return 'ascending';
  if (stored === 'descending') return 'descending';
  return 'manual';
}

export function nextSortMode(mode: SortMode): SortMode {
  if (mode === 'manual') return 'ascending';
  if (mode === 'ascending') return 'descending';
  return 'manual';
}

export function compareBySortMode(
  a: { name: string; sortOrder: number },
  b: { name: string; sortOrder: number },
  mode: SortMode,
): number {
  if (mode === 'ascending') return a.name.localeCompare(b.name);
  if (mode === 'descending') return b.name.localeCompare(a.name);
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

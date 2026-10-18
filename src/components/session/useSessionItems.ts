import { useMemo } from 'react';
import { compareBySortMode, type SortMode } from '@/lib/sortPreference';
import type { FolderRow, SessionData, TemplateItem } from '@/schema/folder';
import { getLeafItems } from '@/utils/itemTreeHelpers';

interface UseSessionItemsParams {
  template: FolderRow | null;
  session: SessionData | null;
  sortMode?: SortMode;
}

export function useSessionItems({ template, session, sortMode = 'manual' }: UseSessionItemsParams) {
  const { activeItems, availableItems, selectedItems, checkedItems } = useMemo(() => {
    const items = template?.items || [];
    const active = getLeafItems(items);
    const available: TemplateItem[] = [];
    const selected: TemplateItem[] = [];
    const checked: TemplateItem[] = [];

    if (!session) {
      return {
        activeItems: active,
        availableItems: available,
        selectedItems: selected,
        checkedItems: checked,
      };
    }

    active.forEach((item) => {
      const state = session.itemStates?.[item.id];

      // Always show all items in available zone
      available.push(item);

      // Also add to selected/checked zones as appropriate
      if (state?.checked) {
        checked.push(item);
      } else if (state?.selected) {
        selected.push(item);
      }
    });

    return {
      activeItems: active,
      availableItems: available.sort((a, b) => compareBySortMode(a, b, sortMode)),
      selectedItems: selected.sort((a, b) => compareBySortMode(a, b, sortMode)),
      checkedItems: checked.sort((a, b) => compareBySortMode(a, b, sortMode)),
    };
  }, [template, session, sortMode]);

  return {
    activeItems,
    availableItems,
    selectedItems,
    checkedItems,
  };
}

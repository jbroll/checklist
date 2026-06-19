import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo } from 'react';
import type { SessionData, Template, TemplateItem } from '@/schema';
import { getLeafItems } from '@/utils/itemTreeHelpers';

/** Sort items by sortOrder (with name as fallback) */
const sortByOrder = (a: TemplateItem, b: TemplateItem) => {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.name.localeCompare(b.name);
};

interface UseSessionItemsParams {
  template: InstanceOfSchema<typeof Template> | null;
  session: SessionData | null;
}

export function useSessionItems({ template, session }: UseSessionItemsParams) {
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
      availableItems: available.sort(sortByOrder),
      selectedItems: selected.sort(sortByOrder),
      checkedItems: checked.sort(sortByOrder),
    };
  }, [template, session]);

  return {
    activeItems,
    availableItems,
    selectedItems,
    checkedItems,
  };
}

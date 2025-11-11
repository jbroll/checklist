import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo } from 'react';
import type { Session, Template, TemplateItem } from '@/schemas';

interface UseSessionItemsParams {
  template: InstanceOfSchema<typeof Template> | null;
  session: InstanceOfSchema<typeof Session> | null;
}

export function useSessionItems({ template, session }: UseSessionItemsParams) {
  const { activeItems, availableItems, selectedItems, checkedItems } = useMemo(() => {
    const items = template?.items || [];
    const active = items.filter((item) => item && !item.archived && item.type === 'item');
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

    // Sort all items by sortOrder (with name as fallback)
    const sortItems = (a: TemplateItem, b: TemplateItem) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    };

    return {
      activeItems: active,
      availableItems: available.sort(sortItems),
      selectedItems: selected.sort(sortItems),
      checkedItems: checked.sort(sortItems),
    };
  }, [template, session]);

  return {
    activeItems,
    availableItems,
    selectedItems,
    checkedItems,
  };
}

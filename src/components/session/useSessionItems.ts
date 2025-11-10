import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo } from 'react';
import type { Session, Template, TemplateItem } from '@/schemas';

interface UseSessionItemsParams {
  template: InstanceOfSchema<typeof Template> | null;
  session: InstanceOfSchema<typeof Session> | null;
}

export function useSessionItems({ template, session }: UseSessionItemsParams) {
  const { activeItems, inventoryItems, cartItems, completedItems } = useMemo(() => {
    const items = template?.items || [];
    const active = items.filter((item) => item && !item.archived && item.type === 'item');
    const inventory: TemplateItem[] = [];
    const cart: TemplateItem[] = [];
    const completed: TemplateItem[] = [];

    if (!session) {
      return {
        activeItems: active,
        inventoryItems: inventory,
        cartItems: cart,
        completedItems: completed,
      };
    }

    active.forEach((item) => {
      const state = session.itemStates?.[item.id];
      if (!state || (!state.selected && !state.checked)) {
        inventory.push(item);
      } else if (state.checked) {
        completed.push(item);
      } else if (state.selected) {
        cart.push(item);
      }
    });

    // Sort all items alphabetically by name
    return {
      activeItems: active,
      inventoryItems: inventory.sort((a, b) => a.name.localeCompare(b.name)),
      cartItems: cart.sort((a, b) => a.name.localeCompare(b.name)),
      completedItems: completed.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [template, session]);

  return {
    activeItems,
    inventoryItems,
    cartItems,
    completedItems,
  };
}

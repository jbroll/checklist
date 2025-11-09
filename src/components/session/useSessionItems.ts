import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo } from 'react';
import type { FolderNode, ListSession } from '@/schemas';

interface UseSessionItemsParams {
  folder: InstanceOfSchema<typeof FolderNode> | null;
  session: InstanceOfSchema<typeof ListSession> | null;
}

export function useSessionItems({ folder, session }: UseSessionItemsParams) {
  const items = folder?.items || [];
  const activeItems = items.filter((item) => item && !item.archived && item.type === 'item');

  const { inventoryItems, cartItems, completedItems } = useMemo(() => {
    const inventory: typeof activeItems = [];
    const cart: typeof activeItems = [];
    const completed: typeof activeItems = [];

    if (!session) {
      return {
        inventoryItems: inventory,
        cartItems: cart,
        completedItems: completed,
      };
    }

    activeItems.forEach((item) => {
      const state = session.itemStates?.[item.$jazz.id];
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
      inventoryItems: inventory.sort((a, b) => a.name.localeCompare(b.name)),
      cartItems: cart.sort((a, b) => a.name.localeCompare(b.name)),
      completedItems: completed.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [activeItems, session]);

  return {
    activeItems,
    inventoryItems,
    cartItems,
    completedItems,
  };
}

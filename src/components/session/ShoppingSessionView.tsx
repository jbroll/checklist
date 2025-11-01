import { ArrowLeft, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAccount } from '@/lib/jazz';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import { SessionZone } from './SessionZone';

interface ShoppingSessionViewProps {
  folder: typeof FolderNode;
  sessionId: string;
  onBack: () => void;
}

export function ShoppingSessionView({ folder, sessionId, onBack }: ShoppingSessionViewProps) {
  const { me } = useAccount<typeof GroceriesAccount>();
  const [zoneExpanded, setZoneExpanded] = useState({
    inventory: true,
    cart: true,
    completed: false,
  });

  // Find session first (before any early returns)
  const session = folder.sessions?.find((s) => s?.$jazz.id === sessionId);
  const items = folder.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Partition items into three zones based on their state (must be called before early returns)
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
      if (!state || (!state.inCart && !state.purchased)) {
        inventory.push(item);
      } else if (state.purchased) {
        completed.push(item);
      } else if (state.inCart) {
        cart.push(item);
      }
    });

    return {
      inventoryItems: inventory,
      cartItems: cart,
      completedItems: completed,
    };
  }, [activeItems, session]);

  // Now handle early returns after hooks
  if (!me || !folder.sessions) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-neutral-600">Session not found</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-green-600 hover:text-green-700"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const handleToggleCart = (itemId: string) => {
    if (!session.itemStates) {
      session.$jazz.set('itemStates', {});
    }

    const itemStates = session.itemStates;
    if (!itemStates) return;

    const currentState = itemStates[itemId];

    if (!currentState) {
      // Create new state by setting the record entry
      itemStates[itemId] = {
        itemId,
        inCart: true,
        purchased: false,
        addedToCartAt: new Date(),
        checkedBy: me,
      };
    } else {
      // Toggle inCart
      currentState.$jazz.set('inCart', !currentState.inCart);
      if (!currentState.inCart) {
        currentState.$jazz.set('addedToCartAt', new Date());
      }
    }

    // Update session activity
    session.$jazz.set('lastActivityAt', new Date());

    // Update counts
    updateCounts();
  };

  const handleTogglePurchased = (itemId: string) => {
    const currentState = session.itemStates?.[itemId];
    if (!currentState) return;

    currentState.$jazz.set('purchased', !currentState.purchased);
    if (!currentState.purchased) {
      currentState.$jazz.set('purchasedAt', new Date());
      currentState.$jazz.set('checkedBy', me);
    }

    session.$jazz.set('lastActivityAt', new Date());
    updateCounts();
  };

  const updateCounts = () => {
    let inCartCount = 0;
    let completedCount = 0;
    let remainingCount = 0;

    activeItems.forEach((item) => {
      const state = session.itemStates?.[item.$jazz.id];
      if (!state || (!state.inCart && !state.purchased)) {
        remainingCount++;
      } else if (state.purchased) {
        completedCount++;
      } else if (state.inCart) {
        inCartCount++;
      }
    });

    session.$jazz.set('inCartCount', inCartCount);
    session.$jazz.set('completedCount', completedCount);
    session.$jazz.set('remainingCount', remainingCount);
  };

  const handleFinishSession = () => {
    session.$jazz.set('status', 'completed');
    session.$jazz.set('completedAt', new Date());
    onBack();
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="h-5 w-5" />
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">{session.name}</h1>
              <p className="mt-1 text-neutral-600">{folder.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFinishSession}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Check className="h-4 w-4" />
            Finish Shopping
          </button>
        </div>

        {/* Three Zones */}
        <div className="flex flex-col gap-4">
          {/* Zone 1: In Cart */}
          <SessionZone
            title="In Cart"
            icon="🛒"
            zone="cart"
            items={cartItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.cart}
            onToggleExpand={() => setZoneExpanded((prev) => ({ ...prev, cart: !prev.cart }))}
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={cartItems.length}
          />

          {/* Zone 2: Completed */}
          <SessionZone
            title="Completed"
            icon="✅"
            zone="completed"
            items={completedItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.completed}
            onToggleExpand={() =>
              setZoneExpanded((prev) => ({ ...prev, completed: !prev.completed }))
            }
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={completedItems.length}
          />

          {/* Zone 3: Template Inventory */}
          <SessionZone
            title="Template Inventory"
            icon="📦"
            zone="inventory"
            items={inventoryItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.inventory}
            onToggleExpand={() =>
              setZoneExpanded((prev) => ({ ...prev, inventory: !prev.inventory }))
            }
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={inventoryItems.length}
          />
        </div>
      </div>
    </div>
  );
}

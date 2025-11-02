import type { InstanceOfSchema } from 'jazz-tools';
import { Check, Download, LayoutGrid, MoreVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/jazz';
import type { Category, FolderNode, GroceriesAccount } from '@/schemas';
import { CATEGORIES } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import { SessionZone } from './SessionZone';

type ViewMode = 'flat' | 'grouped-in-zones' | 'zoned-in-groups';

interface ShoppingSessionViewProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  sessionId: string;
  onBack: () => void;
}

export function ShoppingSessionView({ folder, sessionId, onBack }: ShoppingSessionViewProps) {
  const { me } = useAccount<typeof GroceriesAccount>();
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [zoneExpanded, setZoneExpanded] = useState({
    inventory: true,
    cart: true,
    completed: false,
  });
  const [categoryExpanded, setCategoryExpanded] = useState<Record<string, boolean>>({});
  const [showExportDialog, setShowExportDialog] = useState(false);

  const cycleViewMode = () => {
    setViewMode((current) => {
      if (current === 'flat') return 'grouped-in-zones';
      if (current === 'grouped-in-zones') return 'zoned-in-groups';
      return 'flat';
    });
  };

  const getViewModeLabel = () => {
    if (viewMode === 'flat') return 'Flat View';
    if (viewMode === 'grouped-in-zones') return 'Grouped in Zones';
    return 'Zoned in Groups';
  };

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

  // Group items by category for category-based views
  const itemsByCategory = useMemo(() => {
    const grouped: Record<Category, typeof activeItems> = {
      produce: [],
      dairy: [],
      meat: [],
      pantry: [],
      frozen: [],
      household: [],
      bakery: [],
      beverages: [],
      other: [],
    };

    activeItems.forEach((item) => {
      grouped[item.category].push(item);
    });

    return grouped;
  }, [activeItems]);

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
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.toggleItemInCart(me, folder.$jazz.id, sessionId, itemId);
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.updateSessionCounts(me, folder.$jazz.id, sessionId);
  };

  const handleTogglePurchased = (itemId: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.toggleItemPurchased(me, folder.$jazz.id, sessionId, itemId);
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.updateSessionCounts(me, folder.$jazz.id, sessionId);
  };

  const handleFinishSession = () => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.completeSession(me, folder.$jazz.id, sessionId);
    onBack();
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-neutral-900">
            {session.name} <span className="text-neutral-500">· {folder.name}</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cycleViewMode}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              title="Cycle view mode"
            >
              <LayoutGrid className="h-4 w-4" />
              {getViewModeLabel()}
            </button>
            <button
              type="button"
              onClick={handleFinishSession}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Check className="h-4 w-4" />
              Finish Shopping
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                  aria-label="More options"
                >
                  <MoreVertical className="h-5 w-5 text-neutral-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content based on view mode */}
        <div className="flex flex-col gap-4">
          {viewMode === 'flat' && (
            <>
              {/* Flat View: Simple zones */}
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
              <SessionZone
                title="List Inventory"
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
            </>
          )}

          {viewMode === 'grouped-in-zones' && (
            <>
              {/* Grouped in Zones: Each zone shows category groups */}
              {['cart', 'completed', 'inventory'].map((zone) => {
                const zoneItems =
                  zone === 'cart'
                    ? cartItems
                    : zone === 'completed'
                      ? completedItems
                      : inventoryItems;
                const zoneIcon = zone === 'cart' ? '🛒' : zone === 'completed' ? '✅' : '📦';
                const zoneTitle =
                  zone === 'cart'
                    ? 'In Cart'
                    : zone === 'completed'
                      ? 'Completed'
                      : 'List Inventory';

                // Group zone items by category
                const zoneByCategory: Record<Category, typeof zoneItems> = {
                  produce: [],
                  dairy: [],
                  meat: [],
                  pantry: [],
                  frozen: [],
                  household: [],
                  bakery: [],
                  beverages: [],
                  other: [],
                };
                zoneItems.forEach((item) => {
                  zoneByCategory[item.category].push(item);
                });

                const isZoneExpanded = zoneExpanded[zone as keyof typeof zoneExpanded];
                // Total items = sum of all items in all categories (leaf count)
                const totalItems = zoneItems.length;
                return (
                  <div key={zone}>
                    <SessionZone
                      title={zoneTitle}
                      icon={zoneIcon}
                      zone={zone as 'cart' | 'completed' | 'inventory'}
                      items={[]}
                      itemStates={{}}
                      expanded={isZoneExpanded}
                      onToggleExpand={() =>
                        setZoneExpanded((prev) => ({
                          ...prev,
                          [zone]: !prev[zone as keyof typeof prev],
                        }))
                      }
                      onToggleCart={handleToggleCart}
                      onTogglePurchased={handleTogglePurchased}
                      count={totalItems}
                    >
                      <div className="flex flex-col gap-2">
                        {Object.entries(zoneByCategory).map(([category, items]) => {
                          if (items.length === 0) return null;
                          const catInfo = CATEGORIES[category as Category];
                          const catKey = `${zone}-${category}`;
                          return (
                            <SessionZone
                              key={category}
                              title={catInfo.name}
                              icon={catInfo.icon}
                              zone={zone as 'cart' | 'completed' | 'inventory'}
                              items={items}
                              itemStates={session.itemStates || {}}
                              expanded={categoryExpanded[catKey] ?? true}
                              onToggleExpand={() =>
                                setCategoryExpanded((prev) => ({
                                  ...prev,
                                  [catKey]: !prev[catKey],
                                }))
                              }
                              onToggleCart={handleToggleCart}
                              onTogglePurchased={handleTogglePurchased}
                              count={items.length}
                            />
                          );
                        })}
                      </div>
                    </SessionZone>
                  </div>
                );
              })}
            </>
          )}

          {viewMode === 'zoned-in-groups' && (
            <>
              {/* Zoned in Groups: Categories first, then zone status within each */}
              {Object.entries(itemsByCategory).map(([category, items]) => {
                if (items.length === 0) return null;
                const catInfo = CATEGORIES[category as Category];

                // Split items by zone
                const catInventory = items.filter((item) => {
                  const state = session.itemStates?.[item.$jazz.id];
                  return !state || (!state.inCart && !state.purchased);
                });
                const catCart = items.filter((item) => {
                  const state = session.itemStates?.[item.$jazz.id];
                  return state?.inCart && !state.purchased;
                });
                const catCompleted = items.filter((item) => {
                  const state = session.itemStates?.[item.$jazz.id];
                  return state?.purchased;
                });

                // Total items = sum of items across all zones (leaf count)
                const totalItems = catInventory.length + catCart.length + catCompleted.length;

                return (
                  <SessionZone
                    key={category}
                    title={catInfo.name}
                    icon={catInfo.icon}
                    zone="inventory"
                    items={[]}
                    itemStates={{}}
                    expanded={categoryExpanded[`category-${category}`] ?? true}
                    onToggleExpand={() =>
                      setCategoryExpanded((prev) => ({
                        ...prev,
                        [`category-${category}`]: !prev[`category-${category}`],
                      }))
                    }
                    onToggleCart={handleToggleCart}
                    onTogglePurchased={handleTogglePurchased}
                    count={totalItems}
                  >
                    <div className="flex flex-col gap-2">
                      {catCart.length > 0 && (
                        <SessionZone
                          title="In Cart"
                          icon="🛒"
                          zone="cart"
                          items={catCart}
                          itemStates={session.itemStates || {}}
                          expanded={categoryExpanded[`${category}-cart`] ?? true}
                          onToggleExpand={() =>
                            setCategoryExpanded((prev) => ({
                              ...prev,
                              [`${category}-cart`]: !prev[`${category}-cart`],
                            }))
                          }
                          onToggleCart={handleToggleCart}
                          onTogglePurchased={handleTogglePurchased}
                          count={catCart.length}
                        />
                      )}
                      {catCompleted.length > 0 && (
                        <SessionZone
                          title="Completed"
                          icon="✅"
                          zone="completed"
                          items={catCompleted}
                          itemStates={session.itemStates || {}}
                          expanded={categoryExpanded[`${category}-completed`] ?? true}
                          onToggleExpand={() =>
                            setCategoryExpanded((prev) => ({
                              ...prev,
                              [`${category}-completed`]: !prev[`${category}-completed`],
                            }))
                          }
                          onToggleCart={handleToggleCart}
                          onTogglePurchased={handleTogglePurchased}
                          count={catCompleted.length}
                        />
                      )}
                      {catInventory.length > 0 && (
                        <SessionZone
                          title="List Inventory"
                          icon="📦"
                          zone="inventory"
                          items={catInventory}
                          itemStates={session.itemStates || {}}
                          expanded={categoryExpanded[`${category}-inventory`] ?? true}
                          onToggleExpand={() =>
                            setCategoryExpanded((prev) => ({
                              ...prev,
                              [`${category}-inventory`]: !prev[`${category}-inventory`],
                            }))
                          }
                          onToggleCart={handleToggleCart}
                          onTogglePurchased={handleTogglePurchased}
                          count={catInventory.length}
                        />
                      )}
                    </div>
                  </SessionZone>
                );
              })}
            </>
          )}
        </div>

        {/* Export Dialog */}
        {me && (
          <SessionExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            folder={folder}
            sessionId={sessionId}
            sessionName={session.name}
            // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with account types
            account={me}
          />
        )}
      </div>
    </div>
  );
}

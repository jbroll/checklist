import type { InstanceOfSchema } from 'jazz-tools';
import {
  Archive,
  CheckCircle2,
  Download,
  FolderTree,
  Layers,
  List,
  MoreVertical,
  Package,
  ShoppingCart,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/jazz';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import type { TemplateItem } from '@/schemas/tree';
import * as SessionService from '@/services/sessionService';
import { SessionZone } from './SessionZone';

interface ShoppingSessionViewProps {
  folder: InstanceOfSchema<typeof FolderNode>;
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
  const [categoryExpanded, setCategoryExpanded] = useState<Record<string, boolean>>({});
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Find session first (before any early returns)
  const session = folder.sessions?.find((s) => s?.$jazz.id === sessionId);
  const items = folder.items || [];
  // Only show leaf items (not categories) in shopping sessions
  const activeItems = items.filter((item) => item && !item.archived && item.type === 'item');

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

    // Sort all items alphabetically by name
    return {
      inventoryItems: inventory.sort((a, b) => a.name.localeCompare(b.name)),
      cartItems: cart.sort((a, b) => a.name.localeCompare(b.name)),
      completedItems: completed.sort((a, b) => a.name.localeCompare(b.name)),
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

  const cycleViewMode = () => {
    if (!session || !me) return;
    const current = session.viewMode || 'zone-in-hierarchy';
    const next =
      current === 'flat'
        ? 'hierarchy-in-zones'
        : current === 'hierarchy-in-zones'
          ? 'zone-in-hierarchy'
          : 'flat';
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.updateViewMode(me, folder.$jazz.id, sessionId, next);
  };

  const getViewModeLabel = () => {
    const mode = session?.viewMode || 'zone-in-hierarchy';
    if (mode === 'flat') return 'Flat';
    if (mode === 'hierarchy-in-zones') return 'Categories in Zones';
    return 'Zones in Categories';
  };

  const getViewModeIcon = () => {
    const mode = session?.viewMode || 'zone-in-hierarchy';
    if (mode === 'flat') return List;
    if (mode === 'hierarchy-in-zones') return Layers;
    return FolderTree;
  };

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

  const handleToggleArchived = () => {
    if (!session || !me) return;
    session.$jazz.set('archived', !session.archived);
    session.$jazz.set('lastActivityAt', new Date());
  };

  // Helper to build category tree structure
  const buildCategoryTree = (items: InstanceOfSchema<typeof TemplateItem>[]) => {
    const categoryNodes = new Map<
      string,
      { name: string; path: string; items: InstanceOfSchema<typeof TemplateItem>[] }
    >();

    items.forEach((item) => {
      const pathParts = item.path.split('/');
      const parentPath = pathParts.slice(0, -1).join('/');

      if (parentPath && !categoryNodes.has(parentPath)) {
        // Create category node from path
        const categoryName = pathParts[pathParts.length - 2] || 'Uncategorized';
        categoryNodes.set(parentPath, {
          name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
          path: parentPath,
          items: [],
        });
      }

      if (parentPath) {
        categoryNodes.get(parentPath)?.items.push(item);
      }
    });

    // Sort categories alphabetically by name, and items within each category
    return Array.from(categoryNodes.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(category => ({
        ...category,
        items: category.items.sort((a, b) => a.name.localeCompare(b.name))
      }));
  };

  // Render In Cart and Completed zones based on view mode
  const renderInCartAndCompleted = () => {
    const viewMode = session?.viewMode || 'zone-in-hierarchy';
    const showZoneHeadings = folder.showZoneHeadings ?? false;
    // showZoneHeadings controls zone headers only, categories always show
    const showHeadings = showZoneHeadings;

    // Flat view: Simple zones
    if (viewMode === 'flat') {
      return (
        <>
          <SessionZone
            title="In Cart"
            icon={ShoppingCart}
            zone="cart"
            items={cartItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.cart}
            onToggleExpand={() => setZoneExpanded((prev) => ({ ...prev, cart: !prev.cart }))}
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={cartItems.length}
            showHeading={showHeadings}
          />
          <SessionZone
            title="Completed"
            icon={CheckCircle2}
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
            showHeading={showHeadings}
          />
        </>
      );
    }

    // Hierarchy in Zones: Each zone shows category groups
    if (viewMode === 'hierarchy-in-zones') {
      const zones = [
        { key: 'cart' as const, title: 'In Cart', icon: ShoppingCart, items: cartItems },
        { key: 'completed' as const, title: 'Completed', icon: CheckCircle2, items: completedItems },
      ];

      return (
        <>
          {zones.map((zone) => {
            const categories = buildCategoryTree(zone.items);
            const isZoneExpanded = zoneExpanded[zone.key];

            return (
              <SessionZone
                key={zone.key}
                title={zone.title}
                icon={zone.icon}
                zone={zone.key}
                items={[]}
                itemStates={{}}
                expanded={isZoneExpanded}
                onToggleExpand={() =>
                  setZoneExpanded((prev) => ({
                    ...prev,
                    [zone.key]: !prev[zone.key],
                  }))
                }
                onToggleCart={handleToggleCart}
                onTogglePurchased={handleTogglePurchased}
                count={zone.items.length}
                showHeading={showHeadings}
              >
                {categories.length === 0 ? (
                  <div className="flex flex-col gap-2">
                    {zone.items.map((item) => (
                      <SessionZone
                        key={item.$jazz.id}
                        title={item.name}
                        zone={zone.key}
                        items={[item]}
                        itemStates={session.itemStates || {}}
                        expanded={true}
                        onToggleExpand={() => {}}
                        onToggleCart={handleToggleCart}
                        onTogglePurchased={handleTogglePurchased}
                        count={1}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {categories.map((category) => {
                      const catKey = `${zone.key}-${category.path}`;
                      return (
                        <SessionZone
                          key={category.path}
                          title={category.name}
                          zone={zone.key}
                          items={category.items}
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
                          count={category.items.length}
                        />
                      );
                    })}
                  </div>
                )}
              </SessionZone>
            );
          })}
        </>
      );
    }

    // Zone in Hierarchy: Categories first, then zones within each (In Cart and Completed only)
    if (viewMode === 'zone-in-hierarchy') {
      // Only include categories that have items in cart or completed
      const cartAndCompletedItems = [...cartItems, ...completedItems];
      const categoriesWithItems = buildCategoryTree(cartAndCompletedItems);

      return (
        <>
          {categoriesWithItems.map((category) => {
            // Split category items by zone
            const catCart = category.items.filter((item) => {
              const state = session.itemStates?.[item.$jazz.id];
              return state?.inCart && !state.purchased;
            });
            const catCompleted = category.items.filter((item) => {
              const state = session.itemStates?.[item.$jazz.id];
              return state?.purchased;
            });

            // Skip if no items in cart or completed
            if (catCart.length === 0 && catCompleted.length === 0) return null;

            const totalItems = catCart.length + catCompleted.length;

            return (
              <SessionZone
                key={category.path}
                title={category.name}
                zone="inventory"
                items={[]}
                itemStates={{}}
                expanded={categoryExpanded[`category-${category.path}`] ?? true}
                onToggleExpand={() =>
                  setCategoryExpanded((prev) => ({
                    ...prev,
                    [`category-${category.path}`]: !prev[`category-${category.path}`],
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
                      icon={ShoppingCart}
                      zone="cart"
                      items={catCart}
                      itemStates={session.itemStates || {}}
                      expanded={categoryExpanded[`${category.path}-cart`] ?? true}
                      onToggleExpand={() =>
                        setCategoryExpanded((prev) => ({
                          ...prev,
                          [`${category.path}-cart`]: !prev[`${category.path}-cart`],
                        }))
                      }
                      onToggleCart={handleToggleCart}
                      onTogglePurchased={handleTogglePurchased}
                      count={catCart.length}
                      showHeading={showHeadings}
                    />
                  )}
                  {catCompleted.length > 0 && (
                    <SessionZone
                      title="Completed"
                      icon={CheckCircle2}
                      zone="completed"
                      items={catCompleted}
                      itemStates={session.itemStates || {}}
                      expanded={categoryExpanded[`${category.path}-completed`] ?? true}
                      onToggleExpand={() =>
                        setCategoryExpanded((prev) => ({
                          ...prev,
                          [`${category.path}-completed`]: !prev[`${category.path}-completed`],
                        }))
                      }
                      onToggleCart={handleToggleCart}
                      onTogglePurchased={handleTogglePurchased}
                      count={catCompleted.length}
                      showHeading={showHeadings}
                    />
                  )}
                </div>
              </SessionZone>
            );
          })}
        </>
      );
    }

    return null;
  };

  // Render inventory zone - always at bottom with categories
  const renderInventoryZone = () => {
    const showZoneHeadings = folder.showZoneHeadings ?? false;
    const showHeadings = showZoneHeadings;
    const inventoryCategories = buildCategoryTree(inventoryItems);

    return (
      <SessionZone
        title="List"
        icon={Package}
        zone="inventory"
        items={[]}
        itemStates={{}}
        expanded={zoneExpanded.inventory}
        onToggleExpand={() =>
          setZoneExpanded((prev) => ({ ...prev, inventory: !prev.inventory }))
        }
        onToggleCart={handleToggleCart}
        onTogglePurchased={handleTogglePurchased}
        count={inventoryItems.length}
        showHeading={showHeadings}
      >
        {inventoryCategories.length === 0 ? (
          <div className="flex flex-col gap-2">
            {inventoryItems.map((item) => (
              <SessionZone
                key={item.$jazz.id}
                title={item.name}
                zone="inventory"
                items={[item]}
                itemStates={session.itemStates || {}}
                expanded={true}
                onToggleExpand={() => {}}
                onToggleCart={handleToggleCart}
                onTogglePurchased={handleTogglePurchased}
                count={1}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {inventoryCategories.map((category) => {
              const catKey = `inventory-${category.path}`;
              return (
                <SessionZone
                  key={category.path}
                  title={category.name}
                  zone="inventory"
                  items={category.items}
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
                  count={category.items.length}
                />
              );
            })}
          </div>
        )}
      </SessionZone>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Content: Simple flat zones view */}
        <div className="rounded-lg border border-neutral-200 bg-white">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-4">
            <h1 className="text-3xl font-bold text-neutral-900">
              {session.name} <span className="text-neutral-500">· {folder.name}</span>
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cycleViewMode}
                className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                title={`Cycle view - ${getViewModeLabel()}`}
                aria-label={`Cycle view - ${getViewModeLabel()}`}
              >
                {(() => {
                  const Icon = getViewModeIcon();
                  return <Icon className="h-4 w-4" />;
                })()}
              </button>
              <button
                type="button"
                onClick={handleFinishSession}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Done
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                    aria-label="More options"
                  >
                    <MoreVertical className="h-4 w-4 text-neutral-600" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={session?.archived || false}
                    onCheckedChange={handleToggleArchived}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archived
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="divide-y divide-neutral-100 p-2">
            {renderInCartAndCompleted()}
            {/* Divider between In Cart/Completed and Inventory */}
            {(cartItems.length > 0 || completedItems.length > 0) && inventoryItems.length > 0 && (
              <div className="my-2 border-t-2 border-neutral-200" />
            )}
            {renderInventoryZone()}
          </div>
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

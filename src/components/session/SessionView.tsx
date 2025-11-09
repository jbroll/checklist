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
import { formatSessionDate, hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { Account, FolderNode } from '@/schemas';
import type { TemplateItem } from '@/schemas/tree';
import * as SessionService from '@/services/sessionService';
import { SessionZone } from './SessionZone';

interface SessionViewProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  sessionId: string;
  onBack: () => void;
}

export function SessionView({ folder, sessionId, onBack }: SessionViewProps) {
  const { me } = useAccount<typeof Account>();
  const [zoneExpanded, setZoneExpanded] = useState({
    inventory: true,
    cart: true,
    completed: false,
  });
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Find session first (before any early returns)
  const session = folder.sessions?.find((s) => s?.$jazz.id === sessionId);

  // Check if there are multiple sessions on the same day
  const showTime = hasMultipleSessionsOnSameDay(session || null, folder.sessions || []);

  // Initialize category expanded state from session data
  // Use session.categoryExpanded as the source of truth
  const categoryExpanded: Record<string, boolean> = session?.categoryExpanded || {};
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
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
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
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemSelected(me, folder.$jazz.id, sessionId, itemId);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, folder.$jazz.id, sessionId);
  };

  const handleTogglePurchased = (itemId: string) => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemChecked(me, folder.$jazz.id, sessionId, itemId);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, folder.$jazz.id, sessionId);
  };

  const handleFinishSession = () => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.completeSession(me, folder.$jazz.id, sessionId);
    onBack();
  };

  const handleToggleArchived = () => {
    if (!session || !me) return;
    session.$jazz.set('archived', !session.archived);
    session.$jazz.set('lastActivityAt', new Date());
  };

  // Helper to build multi-level category tree structure
  const buildCategoryTree = (items: InstanceOfSchema<typeof TemplateItem>[]) => {
    interface CategoryNode {
      name: string;
      path: string;
      items: InstanceOfSchema<typeof TemplateItem>[];
      children: CategoryNode[];
      depth: number;
    }

    const categoryMap = new Map<string, CategoryNode>();
    const rootCategories: CategoryNode[] = [];

    // First pass: Create all category nodes
    items.forEach((item) => {
      const pathParts = item.path.split('/');

      // Create category nodes for all levels (excluding the item itself)
      for (let i = 1; i < pathParts.length; i++) {
        const categoryPath = pathParts.slice(0, i).join('/');

        if (!categoryMap.has(categoryPath)) {
          const categoryName = pathParts[i - 1];
          categoryMap.set(categoryPath, {
            name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
            path: categoryPath,
            items: [],
            children: [],
            depth: i - 1,
          });
        }
      }

      // Add item to its immediate parent category
      const parentPath = pathParts.slice(0, -1).join('/');
      if (parentPath) {
        categoryMap.get(parentPath)?.items.push(item);
      }
    });

    // Second pass: Build hierarchy by connecting parents and children
    categoryMap.forEach((category, path) => {
      const pathParts = path.split('/');

      if (pathParts.length === 1) {
        // Top-level category
        rootCategories.push(category);
      } else {
        // Nested category - find parent and add as child
        const parentPath = pathParts.slice(0, -1).join('/');
        const parent = categoryMap.get(parentPath);
        if (parent) {
          parent.children.push(category);
        }
      }
    });

    // Sort categories and items alphabetically
    const sortCategoryTree = (categories: CategoryNode[]): CategoryNode[] => {
      return categories
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({
          ...category,
          items: category.items.sort((a, b) => a.name.localeCompare(b.name)),
          children: sortCategoryTree(category.children),
        }));
    };

    return sortCategoryTree(rootCategories);
  };

  // Helper to recursively render category tree
  const renderCategoryTree = (
    categories: ReturnType<typeof buildCategoryTree>,
    zone: 'inventory' | 'cart' | 'completed',
    keyPrefix: string,
  ): React.ReactNode => {
    return categories.map((category) => {
      const catKey = `${keyPrefix}-${category.path}`;
      const hasChildren = category.children.length > 0;

      return (
        <div key={category.path} className="flex flex-col gap-2">
          <SessionZone
            title={category.name}
            zone={zone}
            items={category.items}
            itemStates={session?.itemStates || {}}
            expanded={categoryExpanded[catKey] ?? true}
            onToggleExpand={() => {
              if (session?.categoryExpanded) {
                const currentValue = categoryExpanded[catKey] ?? true;
                session.$jazz.set('categoryExpanded', {
                  ...categoryExpanded,
                  [catKey]: !currentValue,
                });
              }
            }}
            onToggleSelected={handleToggleCart}
            onToggleChecked={handleTogglePurchased}
            count={category.items.length}
          >
            {hasChildren && (
              <div className="flex flex-col gap-2 pl-4">
                {renderCategoryTree(category.children, zone, keyPrefix)}
              </div>
            )}
          </SessionZone>
        </div>
      );
    });
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
            onToggleSelected={handleToggleCart}
            onToggleChecked={handleTogglePurchased}
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
            onToggleSelected={handleToggleCart}
            onToggleChecked={handleTogglePurchased}
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
        {
          key: 'completed' as const,
          title: 'Completed',
          icon: CheckCircle2,
          items: completedItems,
        },
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
                onToggleSelected={handleToggleCart}
                onToggleChecked={handleTogglePurchased}
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
                        onToggleSelected={handleToggleCart}
                        onToggleChecked={handleTogglePurchased}
                        count={1}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {renderCategoryTree(categories, zone.key, zone.key)}
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

      // Recursive function to count all items in a category tree (including children)
      const countAllItems = (
        category: ReturnType<typeof buildCategoryTree>[0],
      ): { cart: number; completed: number } => {
        let cartCount = 0;
        let completedCount = 0;

        // Count items at this level
        category.items.forEach((item) => {
          const state = session.itemStates?.[item.$jazz.id];
          if (state?.selected && !state.checked) cartCount++;
          if (state?.checked) completedCount++;
        });

        // Count items in children
        category.children.forEach((child) => {
          const childCounts = countAllItems(child);
          cartCount += childCounts.cart;
          completedCount += childCounts.completed;
        });

        return { cart: cartCount, completed: completedCount };
      };

      // Recursive renderer for zone-in-hierarchy mode
      const renderZoneInHierarchy = (
        categories: ReturnType<typeof buildCategoryTree>,
      ): React.ReactNode => {
        return categories.map((category) => {
          // Count all items in this category and its children
          const counts = countAllItems(category);
          const totalItems = counts.cart + counts.completed;

          // Skip if no items in cart or completed
          if (totalItems === 0) return null;

          // Split category items by zone (just at this level, not children)
          const catCart = category.items.filter((item) => {
            const state = session.itemStates?.[item.$jazz.id];
            return state?.selected && !state.checked;
          });
          const catCompleted = category.items.filter((item) => {
            const state = session.itemStates?.[item.$jazz.id];
            return state?.checked;
          });

          const hasDirectItems = catCart.length > 0 || catCompleted.length > 0;
          const hasChildren = category.children.length > 0;

          return (
            <SessionZone
              key={category.path}
              title={category.name}
              zone="inventory"
              items={[]}
              itemStates={{}}
              expanded={categoryExpanded[`category-${category.path}`] ?? true}
              onToggleExpand={() => {
                if (session?.categoryExpanded) {
                  const catKey = `category-${category.path}`;
                  const currentValue = categoryExpanded[catKey] ?? true;
                  session.$jazz.set('categoryExpanded', {
                    ...categoryExpanded,
                    [catKey]: !currentValue,
                  });
                }
              }}
              onToggleSelected={handleToggleCart}
              onToggleChecked={handleTogglePurchased}
              count={totalItems}
            >
              <div className="flex flex-col gap-2">
                {/* Show zones for items at this level */}
                {hasDirectItems && (
                  <>
                    {catCart.length > 0 && (
                      <SessionZone
                        title="In Cart"
                        icon={ShoppingCart}
                        zone="cart"
                        items={catCart}
                        itemStates={session.itemStates || {}}
                        expanded={categoryExpanded[`${category.path}-cart`] ?? true}
                        onToggleExpand={() => {
                          if (session?.categoryExpanded) {
                            const catKey = `${category.path}-cart`;
                            const currentValue = categoryExpanded[catKey] ?? true;
                            session.$jazz.set('categoryExpanded', {
                              ...categoryExpanded,
                              [catKey]: !currentValue,
                            });
                          }
                        }}
                        onToggleSelected={handleToggleCart}
                        onToggleChecked={handleTogglePurchased}
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
                        onToggleExpand={() => {
                          if (session?.categoryExpanded) {
                            const catKey = `${category.path}-completed`;
                            const currentValue = categoryExpanded[catKey] ?? true;
                            session.$jazz.set('categoryExpanded', {
                              ...categoryExpanded,
                              [catKey]: !currentValue,
                            });
                          }
                        }}
                        onToggleSelected={handleToggleCart}
                        onToggleChecked={handleTogglePurchased}
                        count={catCompleted.length}
                        showHeading={showHeadings}
                      />
                    )}
                  </>
                )}

                {/* Recursively render child categories */}
                {hasChildren && (
                  <div className="flex flex-col gap-2 pl-4">
                    {renderZoneInHierarchy(category.children)}
                  </div>
                )}
              </div>
            </SessionZone>
          );
        });
      };

      return <>{renderZoneInHierarchy(categoriesWithItems)}</>;
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
        onToggleExpand={() => setZoneExpanded((prev) => ({ ...prev, inventory: !prev.inventory }))}
        onToggleSelected={handleToggleCart}
        onToggleChecked={handleTogglePurchased}
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
                onToggleSelected={handleToggleCart}
                onToggleChecked={handleTogglePurchased}
                count={1}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {renderCategoryTree(inventoryCategories, 'inventory', 'inventory')}
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
          {/* Header - Mobile responsive: stacks on small screens */}
          <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">
              {folder.name}{' '}
              <span className="text-neutral-500">
                · {formatSessionDate(session.startedAt, showTime)}
              </span>
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
            // @ts-expect-error Jazz TypeScript inference issue with Account root type
            account={me}
          />
        )}
      </div>
    </div>
  );
}

import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ShoppingCart } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { buildCategoryTree, type CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface ZoneInHierarchyRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  cartItems: TemplateItem[];
  completedItems: TemplateItem[];
  categoryExpanded: Record<string, boolean>;
  onToggleCategoryExpanded: (key: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
}

export function ZoneInHierarchyRenderer({
  template,
  session,
  cartItems,
  completedItems,
  categoryExpanded,
  onToggleCategoryExpanded,
  onToggleSelected,
  onToggleChecked,
}: ZoneInHierarchyRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;

  // Only include categories that have items in cart or completed
  const cartAndCompletedItems = [...cartItems, ...completedItems];
  const categoriesWithItems = buildCategoryTree(cartAndCompletedItems);

  // Recursive function to count all items in a category tree (including children)
  const countAllItems = (category: CategoryNode): { cart: number; completed: number } => {
    let cartCount = 0;
    let completedCount = 0;

    // Count items at this level
    category.items.forEach((item) => {
      const state = session.itemStates?.[item.id];
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
  const renderZoneInHierarchy = (categories: CategoryNode[]): React.ReactNode => {
    return categories.map((category) => {
      // Count all items in this category and its children
      const counts = countAllItems(category);
      const totalItems = counts.cart + counts.completed;

      // Skip if no items in cart or completed
      if (totalItems === 0) return null;

      // Split category items by zone (just at this level, not children)
      const catCart = category.items.filter((item) => {
        const state = session.itemStates?.[item.id];
        return state?.selected && !state.checked;
      });
      const catCompleted = category.items.filter((item) => {
        const state = session.itemStates?.[item.id];
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
          onToggleExpand={() => onToggleCategoryExpanded(`category-${category.path}`)}
          onToggleSelected={onToggleSelected}
          onToggleChecked={onToggleChecked}
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
                    onToggleExpand={() => onToggleCategoryExpanded(`${category.path}-cart`)}
                    onToggleSelected={onToggleSelected}
                    onToggleChecked={onToggleChecked}
                    count={catCart.length}
                    showHeading={showZoneHeadings}
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
                    onToggleExpand={() => onToggleCategoryExpanded(`${category.path}-completed`)}
                    onToggleSelected={onToggleSelected}
                    onToggleChecked={onToggleChecked}
                    count={catCompleted.length}
                    showHeading={showZoneHeadings}
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

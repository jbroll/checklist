import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ListChecks } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { buildCategoryTree, type CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface ZoneInHierarchyRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  selectedItems: TemplateItem[];
  checkedItems: TemplateItem[];
  categoryExpanded: Record<string, boolean>;
  onToggleCategoryExpanded: (key: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
}

export function ZoneInHierarchyRenderer({
  template,
  session,
  selectedItems,
  checkedItems,
  categoryExpanded,
  onToggleCategoryExpanded,
  onToggleSelected,
  onToggleChecked,
  showDeleteIcon = false,
  onDeleteItem,
}: ZoneInHierarchyRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;

  // Only include categories that have items selected or checked
  const selectedAndCheckedItems = [...selectedItems, ...checkedItems];
  const categoriesWithItems = buildCategoryTree(selectedAndCheckedItems, template.items);

  // Find items that aren't in any category (root-level items)
  const categorizedItemIds = new Set<string>();
  const collectItemIds = (categories: CategoryNode[]) => {
    for (const cat of categories) {
      for (const item of cat.items) {
        categorizedItemIds.add(item.id);
      }
      collectItemIds(cat.children);
    }
  };
  collectItemIds(categoriesWithItems);

  const uncategorizedSelectedItems = selectedItems.filter(
    (item) => !categorizedItemIds.has(item.id),
  );
  const uncategorizedCheckedItems = checkedItems.filter((item) => !categorizedItemIds.has(item.id));

  // Recursive function to count all items in a category tree (including children)
  const countAllItems = (category: CategoryNode): { selected: number; checked: number } => {
    let selectedCount = 0;
    let checkedCount = 0;

    // Count items at this level
    category.items.forEach((item) => {
      const state = session.itemStates?.[item.id];
      if (state?.selected && !state.checked) selectedCount++;
      if (state?.checked) checkedCount++;
    });

    // Count items in children
    category.children.forEach((child) => {
      const childCounts = countAllItems(child);
      selectedCount += childCounts.selected;
      checkedCount += childCounts.checked;
    });

    return { selected: selectedCount, checked: checkedCount };
  };

  // Recursive renderer for zone-in-hierarchy mode
  const renderZoneInHierarchy = (categories: CategoryNode[]): React.ReactNode => {
    return categories.map((category) => {
      // Count all items in this category and its children
      const counts = countAllItems(category);
      const totalItems = counts.selected + counts.checked;

      // Skip if no items selected or checked
      if (totalItems === 0) return null;

      // Split category items by zone (just at this level, not children)
      const catSelected = category.items.filter((item) => {
        const state = session.itemStates?.[item.id];
        return state?.selected && !state.checked;
      });
      const catChecked = category.items.filter((item) => {
        const state = session.itemStates?.[item.id];
        return state?.checked;
      });

      const hasDirectItems = catSelected.length > 0 || catChecked.length > 0;
      const hasChildren = category.children.length > 0;

      return (
        <SessionZone
          key={category.path}
          title={category.name}
          zone="available"
          items={[]}
          itemStates={{}}
          expanded={categoryExpanded[`category-${category.path}`] ?? true}
          onToggleExpand={() => onToggleCategoryExpanded(`category-${category.path}`)}
          onToggleSelected={onToggleSelected}
          onToggleChecked={onToggleChecked}
          count={totalItems}
        >
          <div className="flex flex-col pl-4">
            {/* Show zones for items at this level */}
            {hasDirectItems && (
              <>
                {catSelected.length > 0 && (
                  <SessionZone
                    title="Selected"
                    icon={ListChecks}
                    zone="selected"
                    items={catSelected}
                    itemStates={session.itemStates || {}}
                    expanded={categoryExpanded[`${category.path}-selected`] ?? true}
                    onToggleExpand={() => onToggleCategoryExpanded(`${category.path}-selected`)}
                    onToggleSelected={onToggleSelected}
                    onToggleChecked={onToggleChecked}
                    count={catSelected.length}
                    showHeading={showZoneHeadings}
                    showDeleteIcon={showDeleteIcon}
                    onDeleteItem={onDeleteItem}
                  />
                )}
                {catChecked.length > 0 && (
                  <SessionZone
                    title="Checked"
                    icon={CheckCircle2}
                    zone="checked"
                    items={catChecked}
                    itemStates={session.itemStates || {}}
                    expanded={categoryExpanded[`${category.path}-checked`] ?? true}
                    onToggleExpand={() => onToggleCategoryExpanded(`${category.path}-checked`)}
                    onToggleSelected={onToggleSelected}
                    onToggleChecked={onToggleChecked}
                    count={catChecked.length}
                    showHeading={showZoneHeadings}
                    showDeleteIcon={showDeleteIcon}
                    onDeleteItem={onDeleteItem}
                  />
                )}
              </>
            )}

            {/* Recursively render child categories */}
            {hasChildren && renderZoneInHierarchy(category.children)}
          </div>
        </SessionZone>
      );
    });
  };

  return (
    <>
      {renderZoneInHierarchy(categoriesWithItems)}
      {/* Render uncategorized items */}
      {(uncategorizedSelectedItems.length > 0 || uncategorizedCheckedItems.length > 0) && (
        <>
          {uncategorizedSelectedItems.length > 0 && (
            <SessionZone
              title="Selected"
              icon={ListChecks}
              zone="selected"
              items={uncategorizedSelectedItems}
              itemStates={session.itemStates || {}}
              expanded={categoryExpanded['uncategorized-selected'] ?? true}
              onToggleExpand={() => onToggleCategoryExpanded('uncategorized-selected')}
              onToggleSelected={onToggleSelected}
              onToggleChecked={onToggleChecked}
              count={uncategorizedSelectedItems.length}
              showHeading={showZoneHeadings}
              showDeleteIcon={showDeleteIcon}
              onDeleteItem={onDeleteItem}
            />
          )}
          {uncategorizedCheckedItems.length > 0 && (
            <SessionZone
              title="Checked"
              icon={CheckCircle2}
              zone="checked"
              items={uncategorizedCheckedItems}
              itemStates={session.itemStates || {}}
              expanded={categoryExpanded['uncategorized-checked'] ?? true}
              onToggleExpand={() => onToggleCategoryExpanded('uncategorized-checked')}
              onToggleSelected={onToggleSelected}
              onToggleChecked={onToggleChecked}
              count={uncategorizedCheckedItems.length}
              showHeading={showZoneHeadings}
              showDeleteIcon={showDeleteIcon}
              onDeleteItem={onDeleteItem}
            />
          )}
        </>
      )}
    </>
  );
}

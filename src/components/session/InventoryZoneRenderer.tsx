import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { buildCategoryTree, type CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface InventoryZoneRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  inventoryItems: TemplateItem[];
  categoryExpanded: Record<string, boolean>;
  zoneExpanded: boolean;
  onToggleZoneExpanded: () => void;
  onToggleCategoryExpanded: (key: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
}

export function InventoryZoneRenderer({
  template,
  session,
  inventoryItems,
  categoryExpanded,
  zoneExpanded,
  onToggleZoneExpanded,
  onToggleCategoryExpanded,
  onToggleSelected,
  onToggleChecked,
}: InventoryZoneRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;
  const inventoryCategories = buildCategoryTree(inventoryItems, template.items);

  const renderCategoryTree = (
    categories: CategoryNode[],
    zone: 'inventory',
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
            onToggleExpand={() => onToggleCategoryExpanded(catKey)}
            onToggleSelected={onToggleSelected}
            onToggleChecked={onToggleChecked}
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

  // If there are no categories, render items directly in the zone
  // Otherwise render the category tree
  const hasCategories = inventoryCategories.length > 0;

  return (
    <SessionZone
      title="List"
      icon={Package}
      zone="inventory"
      items={hasCategories ? [] : inventoryItems}
      itemStates={session.itemStates || {}}
      expanded={zoneExpanded}
      onToggleExpand={onToggleZoneExpanded}
      onToggleSelected={onToggleSelected}
      onToggleChecked={onToggleChecked}
      count={inventoryItems.length}
      showHeading={showZoneHeadings}
    >
      {hasCategories && (
        <div className="flex flex-col gap-2">
          {renderCategoryTree(inventoryCategories, 'inventory', 'inventory')}
        </div>
      )}
    </SessionZone>
  );
}

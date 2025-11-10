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
  const inventoryCategories = buildCategoryTree(inventoryItems);

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

  return (
    <SessionZone
      title="List"
      icon={Package}
      zone="inventory"
      items={[]}
      itemStates={{}}
      expanded={zoneExpanded}
      onToggleExpand={onToggleZoneExpanded}
      onToggleSelected={onToggleSelected}
      onToggleChecked={onToggleChecked}
      count={inventoryItems.length}
      showHeading={showZoneHeadings}
    >
      {inventoryCategories.length === 0 ? (
        <div className="flex flex-col gap-2">
          {inventoryItems.map((item) => (
            <SessionZone
              key={item.id}
              title={item.name}
              zone="inventory"
              items={[item]}
              itemStates={session.itemStates || {}}
              expanded={true}
              onToggleExpand={() => {}}
              onToggleSelected={onToggleSelected}
              onToggleChecked={onToggleChecked}
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
}

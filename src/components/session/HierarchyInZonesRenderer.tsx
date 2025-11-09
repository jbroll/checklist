import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ShoppingCart } from 'lucide-react';
import type { FolderNode, ListSession, TemplateItem } from '@/schemas';
import { buildCategoryTree, type CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface HierarchyInZonesRendererProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  session: InstanceOfSchema<typeof ListSession>;
  cartItems: InstanceOfSchema<typeof TemplateItem>[];
  completedItems: InstanceOfSchema<typeof TemplateItem>[];
  categoryExpanded: Record<string, boolean>;
  zoneExpanded: {
    cart: boolean;
    completed: boolean;
  };
  onToggleZoneExpanded: (zone: 'cart' | 'completed') => void;
  onToggleCategoryExpanded: (key: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
}

export function HierarchyInZonesRenderer({
  folder,
  session,
  cartItems,
  completedItems,
  categoryExpanded,
  zoneExpanded,
  onToggleZoneExpanded,
  onToggleCategoryExpanded,
  onToggleSelected,
  onToggleChecked,
}: HierarchyInZonesRendererProps) {
  const showZoneHeadings = folder.showZoneHeadings ?? false;

  const renderCategoryTree = (
    categories: CategoryNode[],
    zone: 'cart' | 'completed',
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
            onToggleExpand={() => onToggleZoneExpanded(zone.key)}
            onToggleSelected={onToggleSelected}
            onToggleChecked={onToggleChecked}
            count={zone.items.length}
            showHeading={showZoneHeadings}
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
                    onToggleSelected={onToggleSelected}
                    onToggleChecked={onToggleChecked}
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

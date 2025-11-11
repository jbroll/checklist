import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { buildCategoryTree, type CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface AvailableZoneRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  availableItems: TemplateItem[];
  categoryExpanded: Record<string, boolean>;
  zoneExpanded: boolean;
  onToggleZoneExpanded: () => void;
  onToggleCategoryExpanded: (key: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
}

export function AvailableZoneRenderer({
  template,
  session,
  availableItems,
  categoryExpanded,
  zoneExpanded,
  onToggleZoneExpanded,
  onToggleCategoryExpanded,
  onToggleSelected,
  onToggleChecked,
}: AvailableZoneRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;
  const availableCategories = buildCategoryTree(availableItems, template.items);

  const renderCategoryTree = (
    categories: CategoryNode[],
    zone: 'available',
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
  const hasCategories = availableCategories.length > 0;

  return (
    <SessionZone
      title="List"
      icon={Package}
      zone="available"
      items={hasCategories ? [] : availableItems}
      itemStates={session.itemStates || {}}
      expanded={zoneExpanded}
      onToggleExpand={onToggleZoneExpanded}
      onToggleSelected={onToggleSelected}
      onToggleChecked={onToggleChecked}
      count={availableItems.length}
      showHeading={showZoneHeadings}
    >
      {hasCategories && (
        <div className="flex flex-col gap-2">
          {renderCategoryTree(availableCategories, 'available', 'available')}
        </div>
      )}
    </SessionZone>
  );
}

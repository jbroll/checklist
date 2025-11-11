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
  onBatchSelectAll: (itemIds: string[]) => void;
  onBatchDeselectAll: (itemIds: string[]) => void;
  onBatchToggle: (itemIds: string[]) => void;
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
  onBatchSelectAll,
  onBatchDeselectAll,
  onBatchToggle,
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
        <div key={category.path} className="flex flex-col">
          <SessionZone
            title={category.name}
            zone={zone}
            items={category.items}
            itemStates={session?.itemStates || {}}
            expanded={categoryExpanded[catKey] ?? true}
            onToggleExpand={() => onToggleCategoryExpanded(catKey)}
            onToggleSelected={onToggleSelected}
            onToggleChecked={onToggleChecked}
            onBatchSelectAll={onBatchSelectAll}
            onBatchDeselectAll={onBatchDeselectAll}
            onBatchToggle={onBatchToggle}
            count={category.items.length}
            category={category}
          >
            {hasChildren && (
              <div className="flex flex-col pl-4">
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

  // For top-level zone with categories, we still want to show batch selection
  // based on all items, not just direct children
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
      onBatchSelectAll={onBatchSelectAll}
      onBatchDeselectAll={onBatchDeselectAll}
      onBatchToggle={onBatchToggle}
      count={availableItems.length}
      showHeading={showZoneHeadings}
      isTopLevelZone={true}
      category={
        hasCategories
          ? { name: 'List', path: 'list', items: [], children: availableCategories, depth: 0 }
          : null
      }
    >
      {hasCategories && (
        <div className="flex flex-col">
          {renderCategoryTree(availableCategories, 'available', 'available')}
        </div>
      )}
    </SessionZone>
  );
}

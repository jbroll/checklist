import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ListChecks } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { buildCategoryTree, type CategoryNode } from './categoryTreeBuilder';
import { SessionItemRow } from './SessionItemRow';
import { SessionZone } from './SessionZone';

interface HierarchyInZonesRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  selectedItems: TemplateItem[];
  checkedItems: TemplateItem[];
  categoryExpanded: Record<string, boolean>;
  zoneExpanded: {
    selected: boolean;
    checked: boolean;
  };
  onToggleZoneExpanded: (zone: 'selected' | 'checked') => void;
  onToggleCategoryExpanded: (key: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  onBatchSelectAll?: (itemIds: string[]) => void;
  onBatchDeselectAll?: (itemIds: string[]) => void;
  onBatchToggle?: (itemIds: string[]) => void;
}

export function HierarchyInZonesRenderer({
  template,
  session,
  selectedItems,
  checkedItems,
  categoryExpanded,
  zoneExpanded,
  onToggleZoneExpanded,
  onToggleCategoryExpanded,
  onToggleSelected,
  onToggleChecked,
  onBatchSelectAll,
  onBatchDeselectAll,
  onBatchToggle,
}: HierarchyInZonesRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;

  const renderCategoryTree = (
    categories: CategoryNode[],
    zone: 'selected' | 'checked',
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
            items={[]}
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
            <div className="pl-4 flex flex-col">
              {/* Render items first */}
              {category.items.map((item) => (
                <SessionItemRow
                  key={item.id}
                  item={item}
                  state={session.itemStates?.[item.id] || null}
                  zone={zone}
                  onToggleSelected={onToggleSelected}
                  onToggleChecked={onToggleChecked}
                />
              ))}
              {/* Then render child categories */}
              {hasChildren && renderCategoryTree(category.children, zone, keyPrefix)}
            </div>
          </SessionZone>
        </div>
      );
    });
  };

  const zones = [
    { key: 'selected' as const, title: 'Selected', icon: ListChecks, items: selectedItems },
    {
      key: 'checked' as const,
      title: 'Checked',
      icon: CheckCircle2,
      items: checkedItems,
    },
  ];

  return (
    <>
      {zones.map((zone) => {
        const categories = buildCategoryTree(zone.items, template.items);
        const isZoneExpanded = zoneExpanded[zone.key];
        const hasCategories = categories.length > 0;

        return (
          <SessionZone
            key={zone.key}
            title={zone.title}
            icon={zone.icon}
            zone={zone.key}
            items={hasCategories ? [] : zone.items}
            itemStates={session.itemStates || {}}
            expanded={isZoneExpanded}
            onToggleExpand={() => onToggleZoneExpanded(zone.key)}
            onToggleSelected={onToggleSelected}
            onToggleChecked={onToggleChecked}
            count={zone.items.length}
            showHeading={showZoneHeadings}
          >
            {hasCategories && (
              <div className="flex flex-col">
                {renderCategoryTree(categories, zone.key, zone.key)}
              </div>
            )}
          </SessionZone>
        );
      })}
    </>
  );
}

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
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
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
  showDeleteIcon = false,
  onDeleteItem,
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

      // Detect if this is a pseudo-category for a root-level item
      // (created by buildCategoryTree for items with no parent category)
      const isRootItem =
        category.items.length === 1 &&
        category.children.length === 0 &&
        category.items[0].path === category.path;

      // Debug logging
      if (category.items.length === 1 && category.children.length === 0) {
        console.log('[HierarchyInZones] Potential root item:', {
          categoryName: category.name,
          categoryPath: category.path,
          itemName: category.items[0].name,
          itemPath: category.items[0].path,
          itemType: category.items[0].type,
          isRootItem,
          pathsMatch: category.items[0].path === category.path,
        });
      }

      // If it's a root item, render it directly without category wrapper
      if (isRootItem) {
        return (
          <SessionItemRow
            key={category.items[0].id}
            item={category.items[0]}
            state={session.itemStates?.[category.items[0].id] || null}
            zone={zone}
            onToggleSelected={onToggleSelected}
            onToggleChecked={onToggleChecked}
            showDeleteIcon={showDeleteIcon}
            onDeleteItem={onDeleteItem}
          />
        );
      }

      // Otherwise, render as a category with items and children
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
            showDeleteIcon={showDeleteIcon}
            onDeleteItem={onDeleteItem}
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
                  showDeleteIcon={showDeleteIcon}
                  onDeleteItem={onDeleteItem}
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
            showDeleteIcon={showDeleteIcon}
            onDeleteItem={onDeleteItem}
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

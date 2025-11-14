import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { buildItemTree, type ItemTreeNode } from '@/utils/itemTreeHelpers';
import type { CategoryNode } from './categoryTreeBuilder';
import { SessionItemRow } from './SessionItemRow';
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
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string | null) => void;
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
  showDeleteIcon = false,
  onDeleteItem,
  selectedItemId = null,
  onSelectItem,
}: AvailableZoneRendererProps) {
  console.log('[AvailableZoneRenderer] selectedItemId:', selectedItemId, 'hasOnSelectItem:', !!onSelectItem);
  const showZoneHeadings = template.showZoneHeadings ?? false;

  // Build tree from ALL template items, not just availableItems
  // availableItems only contains leaf items (type='item'), missing categories
  const allItems = template.items || [];
  const activeItems = allItems.filter((item) => item && !item.archived);
  const itemTree = buildItemTree(activeItems);

  // Helper to collect all items from a tree node (including descendants)
  const collectAllItems = (node: ItemTreeNode): TemplateItem[] => {
    const items: TemplateItem[] = [];
    if (node.item.type === 'item') {
      items.push(node.item);
    }
    for (const child of node.children) {
      items.push(...collectAllItems(child));
    }
    return items;
  };

  // Helper to convert ItemTreeNode to CategoryNode structure for batch operations
  const toCategoryNode = (node: ItemTreeNode): CategoryNode => {
    const allChildItems = node.children.flatMap(collectAllItems);
    return {
      name: node.item.name,
      path: node.item.path,
      items: allChildItems,
      children: node.children.map(toCategoryNode),
      depth: 0,
      sortOrder: node.item.sortOrder,
    };
  };

  const renderItemTree = (nodes: ItemTreeNode[], zone: 'available'): React.ReactNode => {
    return nodes.map((node) => {
      const item = node.item;
      const hasChildren = node.children.length > 0;

      // Leaf items - render as SessionItemRow
      if (item.type === 'item') {
        return (
          <SessionItemRow
            key={item.id}
            item={item}
            state={session.itemStates?.[item.id] || null}
            zone={zone}
            onToggleSelected={onToggleSelected}
            onToggleChecked={onToggleChecked}
            showDeleteIcon={showDeleteIcon}
            onDeleteItem={onDeleteItem}
            isSelected={selectedItemId === item.id}
            onSelectItem={onSelectItem}
          />
        );
      }

      // Categories - render as SessionZone with children
      const catKey = `available-${item.path}`;
      return (
        <div key={item.path} className="flex flex-col">
          <SessionZone
            title={item.name}
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
            count={node.children.length}
            category={toCategoryNode(node)}
            showDeleteIcon={showDeleteIcon}
            onDeleteItem={onDeleteItem}
          >
            {hasChildren && (
              <div className="flex flex-col pl-4">{renderItemTree(node.children, zone)}</div>
            )}
          </SessionZone>
        </div>
      );
    });
  };

  // Create top-level category node for batch operations
  const topLevelCategory = {
    name: 'List',
    path: 'list',
    items: availableItems,
    children: itemTree.map(toCategoryNode),
    depth: 0,
  };

  return (
    <SessionZone
      title="List"
      icon={Package}
      zone="available"
      items={[]}
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
      category={topLevelCategory}
      showDeleteIcon={showDeleteIcon}
      onDeleteItem={onDeleteItem}
    >
      <div className="flex flex-col">{renderItemTree(itemTree, 'available')}</div>
    </SessionZone>
  );
}

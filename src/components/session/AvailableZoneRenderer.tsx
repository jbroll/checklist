import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { useAccount } from '@/lib/jazz';
import type { Account, Session, Template, TemplateItem } from '@/schemas';
import { handleItemMove, handleItemReorder } from '@/services/dragDropService';
import { buildItemTree, type ItemTreeNode } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import type { CategoryNode } from './categoryTreeBuilder';
import { DraggableSessionItem } from './DraggableSessionItem';
import { DraggableSessionZone } from './DraggableSessionZone';
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
  console.log(
    '[AvailableZoneRenderer] selectedItemId:',
    selectedItemId,
    'hasOnSelectItem:',
    !!onSelectItem,
  );
  const { me } = useAccount<typeof Account>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const showZoneHeadings = template.showZoneHeadings ?? false;

  // Set up sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
  );

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

  // Handle drag start
  const handleDragStart = (event: DragEndEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id || !me) {
      return;
    }

    try {
      const activeData = active.data.current;
      const overData = over.data.current;

      if (!activeData?.item) {
        console.error('[DragEnd] No active item data');
        return;
      }

      const draggedItem = activeData.item as TemplateItem;
      const overItem = overData?.item as TemplateItem | undefined;

      if (!overItem) {
        console.error('[DragEnd] No over item data');
        return;
      }

      const draggedParent = getParentPath(draggedItem.path);

      // Determine the new parent path based on what was dropped on
      let newParentPath: string | undefined;
      if (overData?.type === 'category') {
        // Dropped onto a category - make it a child of that category
        newParentPath = overItem.path;
      } else if (overData?.type === 'item') {
        // Dropped onto an item - use the same parent as that item
        newParentPath = getParentPath(overItem.path);
      } else {
        // Dropped at root level
        newParentPath = undefined;
      }

      console.log('[DragEnd] Dragging', draggedItem.name, 'over', overItem.name);
      console.log('[DragEnd] Dragged parent:', draggedParent, 'New parent:', newParentPath);

      // Check if we're moving to a different parent or reordering within the same parent
      if (draggedParent === newParentPath) {
        // Reordering within the same parent
        console.log('[DragEnd] Reordering within same parent');
        // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
        handleItemReorder(me as any, template.$jazz.id, active.id as string, over.id as string);
      } else {
        // Moving to a different parent
        console.log('[DragEnd] Moving to different parent');
        // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
        handleItemMove(
          me as any,
          template.$jazz.id,
          active.id as string,
          newParentPath,
          over.id as string,
        );
      }
    } catch (error) {
      console.error('[DragEnd] Error:', error);
    }
  };

  // Collect all item IDs at a given level for SortableContext
  const collectItemIds = (nodes: ItemTreeNode[]): string[] => {
    return nodes.map((node) => node.item.id);
  };

  const renderItemTree = (nodes: ItemTreeNode[], zone: 'available'): React.ReactNode => {
    // Create a sortable context for this level
    const itemIds = collectItemIds(nodes);

    return (
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {nodes.map((node) => {
          const item = node.item;
          const hasChildren = node.children.length > 0;

          // Leaf items - render as DraggableSessionItemRow
          if (item.type === 'item') {
            return (
              <DraggableSessionItem
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

          // Categories - render as DraggableSessionZone with children
          const catKey = `available-${item.path}`;
          return (
            <div key={item.path} className="flex flex-col">
              <DraggableSessionZone
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
                categoryItem={item}
                isSelected={selectedItemId === item.id}
                onSelectItem={onSelectItem}
              >
                {hasChildren && (
                  <div className="flex flex-col pl-4">{renderItemTree(node.children, zone)}</div>
                )}
              </DraggableSessionZone>
            </div>
          );
        })}
      </SortableContext>
    );
  };

  // Create top-level category node for batch operations
  const topLevelCategory = {
    name: 'List',
    path: 'list',
    items: availableItems,
    children: itemTree.map(toCategoryNode),
    depth: 0,
  };

  // Find active item for drag overlay
  const activeItem = activeId ? allItems.find((item) => item?.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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

      <DragOverlay>
        {activeItem && activeItem.type === 'item' ? (
          <div className="bg-white shadow-lg rounded-md p-2 border border-neutral-300">
            <SessionItemRow
              item={activeItem}
              state={session.itemStates?.[activeItem.id] || null}
              zone="available"
              onToggleSelected={() => {}}
              onToggleChecked={() => {}}
            />
          </div>
        ) : activeItem && activeItem.type === 'category' ? (
          <div className="bg-white shadow-lg rounded-md p-2 border border-neutral-300">
            <div className="font-semibold text-neutral-900">{activeItem.name}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

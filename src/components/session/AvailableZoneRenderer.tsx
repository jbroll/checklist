import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { ReorderDropZone } from '@/components/tree/ReorderDropZone';
import { useAccount } from '@/lib/jazz';
import type { InteractionMode } from '@/lib/useSessionInteractionMode';
import type { Account, SessionData, Template, TemplateItem } from '@/schemas';
import * as templateService from '@/services/templateService';
import { buildItemTree, type ItemTreeNode } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import { calculateMidpointSortOrder } from '@/utils/sortOrderHelpers';
import type { CategoryNode } from './categoryTreeBuilder';
import { DraggableCategory } from './DraggableCategory';
import { SessionItemRow } from './SessionItemRow';
import { SessionZone } from './SessionZone';

interface AvailableZoneRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData;
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
  simplifiedUI?: boolean;
  // Interaction mode props
  interactionMode: InteractionMode;
  onEnterEditMode: (itemId: string) => void;
  onExitEditMode: () => void;
  onEnterDragMode: (itemId: string) => void;
  onExitDragMode: () => void;
  canEdit: (itemId: string) => boolean;
  canDrag: (itemId: string) => boolean;
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
  simplifiedUI = false,
  interactionMode,
  onEnterEditMode,
  onExitEditMode,
  onEnterDragMode,
  onExitDragMode,
  canEdit,
  canDrag,
}: AvailableZoneRendererProps) {
  const { me } = useAccount<typeof Account>();
  const [activeItem, setActiveItem] = useState<TemplateItem | null>(null);
  const showZoneHeadings = template.showZoneHeadings ?? false;

  // Configure sensors for drag detection with long press (1 second)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 1000, // 1 second long press to activate drag
        tolerance: 5, // Allow 5px of movement during hold (for shaky fingers)
      },
    }),
  );

  // Build tree from ALL template items
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

  const handleDragStart = (event: DragStartEvent) => {
    const draggedItem = event.active.data.current?.item as TemplateItem;
    setActiveItem(draggedItem);
    // Enter drag mode to prevent other interactions
    onEnterDragMode(draggedItem.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    // Exit drag mode when drag completes
    onExitDragMode();

    if (!over || !active.data.current || !me) {
      return;
    }

    const draggedItem = active.data.current.item as TemplateItem;
    const overData = over.data.current;

    // Don't allow dropping on itself
    if (over.id === active.id) {
      return;
    }

    // Handle reorder zone drops
    if (overData?.type === 'reorder-zone') {
      const currentParentPath = getParentPath(draggedItem.path);
      const targetParentPath = overData.parentPath as string | undefined;

      // Prevent moving a category into itself or its descendants
      if (draggedItem.type === 'category') {
        // Check if target is inside the dragged category
        if (targetParentPath?.startsWith(draggedItem.path)) {
          return;
        }
        // Check if target IS the dragged category
        if (targetParentPath === draggedItem.path) {
          return;
        }
      }

      // Get siblings at the target level
      const siblings = activeItems.filter((item) => getParentPath(item.path) === targetParentPath);
      siblings.sort((a, b) => a.sortOrder - b.sortOrder);

      const afterItemId = overData.afterItemId as string | undefined;
      const beforeItemId = overData.beforeItemId as string | undefined;

      // Find the sortOrder values to calculate midpoint
      let beforeSortOrder: number | undefined;
      let afterSortOrder: number | undefined;

      if (afterItemId) {
        const afterItem = siblings.find((item) => item.id === afterItemId);
        afterSortOrder = afterItem?.sortOrder;
      }

      if (beforeItemId) {
        const beforeItem = siblings.find((item) => item.id === beforeItemId);
        beforeSortOrder = beforeItem?.sortOrder;
      }

      // Calculate new sortOrder using fractional indexing
      const newSortOrder = calculateMidpointSortOrder(afterSortOrder, beforeSortOrder);

      // Check if moving to a different parent or just reordering
      if (targetParentPath !== currentParentPath) {
        // Move and reorder in a single operation
        try {
          templateService.moveItem(
            // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
            me as any,
            template.$jazz.id,
            draggedItem.id,
            targetParentPath,
            newSortOrder,
          );
        } catch {
          // Silently ignore errors (e.g., duplicate names)
        }
      } else {
        // Just reordering within the same parent
        try {
          templateService.reorderItem(
            // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
            me as any,
            template.$jazz.id,
            draggedItem.id,
            newSortOrder,
          );
        } catch {
          // Silently ignore errors
        }
      }
      return;
    }

    // Handle drops on categories (move item into category)
    if (overData?.isCategory) {
      const newParentPath = overData.path as string;
      const currentParentPath = getParentPath(draggedItem.path);

      // Don't move if already in this category
      if (newParentPath === currentParentPath) {
        return;
      }

      // Prevent moving a category into itself or its descendants
      if (draggedItem.type === 'category' && newParentPath?.startsWith(draggedItem.path)) {
        return;
      }

      // Insert at the start of the category
      // Get items in target category and find first item's sortOrder
      const categoryItems = activeItems.filter(
        (item) => getParentPath(item.path) === newParentPath,
      );
      categoryItems.sort((a, b) => a.sortOrder - b.sortOrder);

      // Calculate sortOrder to insert before first item (at start of category)
      const firstItemSortOrder = categoryItems.length > 0 ? categoryItems[0].sortOrder : undefined;
      const newSortOrder = calculateMidpointSortOrder(undefined, firstItemSortOrder);

      try {
        templateService.moveItem(
          // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
          me as any,
          template.$jazz.id,
          draggedItem.id,
          newParentPath,
          newSortOrder,
        );
      } catch {
        // Silently ignore errors
      }
    }
  };

  const renderItemTree = (
    nodes: ItemTreeNode[],
    zone: 'available',
    parentPath?: string,
  ): React.ReactNode => {
    if (nodes.length === 0) return null;

    return (
      <div className="flex flex-col">
        {nodes.map((node, index) => {
          const item = node.item;
          const hasChildren = node.children.length > 0;

          return (
            <div key={item.id}>
              {/* Drop zone before this item */}
              <ReorderDropZone
                id={`reorder-before-${item.id}`}
                beforeItemId={index > 0 ? nodes[index - 1].item.id : undefined}
                afterItemId={item.id}
                parentPath={parentPath}
                isDragging={!!activeItem}
              />

              {/* Leaf items - render as SessionItemRow */}
              {item.type === 'item' && (
                <SessionItemRow
                  item={item}
                  state={session.itemStates?.[item.id] || null}
                  zone={zone}
                  onToggleSelected={onToggleSelected}
                  onToggleChecked={onToggleChecked}
                  showDeleteIcon={showDeleteIcon}
                  onDeleteItem={onDeleteItem}
                  isSelected={selectedItemId === item.id}
                  onSelectItem={onSelectItem}
                  enableDrag={true}
                  template={template}
                  simplifiedUI={simplifiedUI}
                  // Interaction mode props
                  isEditingThisItem={
                    interactionMode.mode === 'editing' && interactionMode.itemId === item.id
                  }
                  canEditItem={canEdit(item.id)}
                  canDragItem={canDrag(item.id)}
                  onEnterEditMode={() => onEnterEditMode(item.id)}
                  onExitEditMode={onExitEditMode}
                />
              )}

              {/* Categories - render as DraggableCategory with children */}
              {item.type === 'category' && (
                <DraggableCategory
                  item={item}
                  categoryNode={toCategoryNode(node)}
                  categoryExpanded={categoryExpanded}
                  onToggleCategoryExpanded={onToggleCategoryExpanded}
                  onToggleSelected={onToggleSelected}
                  onToggleChecked={onToggleChecked}
                  onBatchSelectAll={onBatchSelectAll}
                  onBatchDeselectAll={onBatchDeselectAll}
                  onBatchToggle={onBatchToggle}
                  showDeleteIcon={showDeleteIcon}
                  onDeleteItem={onDeleteItem}
                  selectedItemId={selectedItemId}
                  onSelectItem={onSelectItem}
                  itemStates={session?.itemStates || {}}
                  template={template}
                  simplifiedUI={simplifiedUI}
                  // Interaction mode props
                  interactionMode={interactionMode}
                  onEnterEditMode={onEnterEditMode}
                  onExitEditMode={onExitEditMode}
                  canEdit={canEdit}
                  canDrag={canDrag}
                >
                  {hasChildren && (
                    <div className="flex flex-col pl-4">
                      {renderItemTree(node.children, zone, item.path)}
                    </div>
                  )}
                </DraggableCategory>
              )}

              {/* Drop zone after last item */}
              {index === nodes.length - 1 && (
                <ReorderDropZone
                  id={`reorder-after-${item.id}`}
                  beforeItemId={item.id}
                  afterItemId={undefined}
                  parentPath={parentPath}
                  isDragging={!!activeItem}
                />
              )}
            </div>
          );
        })}
      </div>
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
        template={template}
        simplifiedUI={simplifiedUI}
      >
        {renderItemTree(itemTree, 'available')}
      </SessionZone>
    </DndContext>
  );
}

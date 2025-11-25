import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import { ReorderDropZone } from '@/components/tree/ReorderDropZone';
import type { InteractionMode } from '@/lib/useSessionInteractionMode';
import type { SessionData, Template, TemplateItem } from '@/schemas';
import { buildItemTree, type ItemTreeNode } from '@/utils/itemTreeHelpers';
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
  activeItem: TemplateItem | null;
  // Interaction mode props
  interactionMode: InteractionMode;
  onEnterEditMode: (itemId: string) => void;
  onExitEditMode: () => void;
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
  activeItem,
  interactionMode,
  onEnterEditMode,
  onExitEditMode,
  canEdit,
  canDrag,
}: AvailableZoneRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;

  // Debug: Track renders
  console.log('[AvailableZoneRenderer] RENDER - activeItem:', activeItem?.name || 'NULL');

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
                  // Interaction mode props
                  isEditingThisItem={
                    interactionMode.mode === 'editing' && interactionMode.itemId === item.id
                  }
                  canEditItem={canEdit(item.id)}
                  canDragItem={canDrag(item.id)}
                  isAnyItemBeingEditedOrDragged={interactionMode.mode !== 'normal'}
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
    name: 'Available Items',
    path: 'available',
    items: availableItems,
    children: itemTree.map(toCategoryNode),
    depth: 0,
  };

  return (
    <SessionZone
      title="Available Items"
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
    >
      {renderItemTree(itemTree, 'available')}
    </SessionZone>
  );
}

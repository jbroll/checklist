import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { ItemState, TemplateItem } from '@/schemas';
import type { CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface DraggableCategoryProps {
  item: TemplateItem;
  categoryNode: CategoryNode;
  categoryExpanded: Record<string, boolean>;
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
  itemStates: Record<string, ItemState>;
  children?: React.ReactNode;
}

export function DraggableCategory({
  item,
  categoryNode,
  categoryExpanded,
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
  itemStates,
  children,
}: DraggableCategoryProps) {
  // Draggable setup for categories
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
  });

  return (
    <div className={`flex items-start gap-1 ${isDragging ? 'opacity-50' : ''}`}>
      {/* Drag handle icon - visible indicator */}
      <div className="text-neutral-400 hover:text-neutral-600 shrink-0 mt-2">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Draggable wrapper for SessionZone */}
      <div
        ref={setDragRef}
        {...dragAttributes}
        {...dragListeners}
        className="flex-1 min-w-0 cursor-grab active:cursor-grabbing"
      >
        <SessionZone
          title={item.name}
          zone="available"
          items={[]}
          itemStates={itemStates}
          expanded={categoryExpanded[`available-${item.path}`] ?? true}
          onToggleExpand={() => onToggleCategoryExpanded(`available-${item.path}`)}
          onToggleSelected={onToggleSelected}
          onToggleChecked={onToggleChecked}
          onBatchSelectAll={onBatchSelectAll}
          onBatchDeselectAll={onBatchDeselectAll}
          onBatchToggle={onBatchToggle}
          count={categoryNode.children.length}
          category={categoryNode}
          showDeleteIcon={showDeleteIcon}
          onDeleteItem={onDeleteItem}
          categoryItem={item}
          isSelected={selectedItemId === item.id}
          onSelectItem={onSelectItem}
        >
          {children}
        </SessionZone>
      </div>
    </div>
  );
}

import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { useLongPressIndicator } from '@/lib/useLongPressIndicator';
import type { InteractionMode } from '@/lib/useSessionInteractionMode';
import type { FolderNode, ItemState, TemplateItem } from '@/schemas';
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
  template?: InstanceOfSchema<typeof FolderNode>;
  simplifiedUI?: boolean;
  // Interaction mode props
  interactionMode: InteractionMode;
  onEnterEditMode: (itemId: string) => void;
  onExitEditMode: () => void;
  canEdit: (itemId: string) => boolean;
  canDrag: (itemId: string) => boolean;
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
  template,
  simplifiedUI = false,
  interactionMode,
  onEnterEditMode,
  onExitEditMode,
  canEdit,
  canDrag,
}: DraggableCategoryProps) {
  // Draggable setup for categories - respect canDrag permission
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
    disabled: !canDrag(item.id),
  });

  // Droppable setup - categories can accept drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${item.id}`,
    data: { isCategory: true, path: item.path, item },
  });

  // Long press visual feedback
  const { isHolding, longPressHandlers } = useLongPressIndicator(isDragging);

  // Only show drag feedback when dragging is actually enabled
  const canActuallyDrag = canDrag(item.id);

  return (
    <div className="flex-1 min-w-0">
      {/* Category header - draggable and droppable (header only, not children) */}
      <div
        ref={(node) => {
          setDragRef(node);
          setDropRef(node);
        }}
        {...(canActuallyDrag ? dragAttributes : {})}
        {...(canActuallyDrag ? dragListeners : {})}
        {...(canActuallyDrag ? longPressHandlers : {})}
        className={`transition-all duration-200 ${canActuallyDrag && !isDragging ? 'cursor-grab' : ''} ${isDragging ? 'opacity-50 cursor-grabbing' : ''} ${
          isOver ? 'bg-green-100 border-2 border-green-500 border-dashed rounded' : ''
        } ${isHolding && canActuallyDrag ? 'scale-[1.01] shadow-lg bg-blue-50 ring-2 ring-blue-300 rounded' : ''}`}
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
      </div>

      {/* Category children - rendered outside drop zone, respecting expand state */}
      {(categoryExpanded[`available-${item.path}`] ?? true) && children}
    </div>
  );
}

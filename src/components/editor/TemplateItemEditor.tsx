import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Folder } from 'lucide-react';
import { useState } from 'react';
import { NoteEditorDialog } from '@/components/session/NoteEditorDialog';
import { ReorderDropZone } from '@/components/tree/ReorderDropZone';
import { TemplateItemView } from '@/components/tree/TemplateItemView';
import { useDialog } from '@/lib/dialog-context';
import { useAccount } from '@/lib/jazz';
import type { Account, Template, TemplateItem } from '@/schemas';
import * as ItemService from '@/services/templateService';
import * as viewStateService from '@/services/viewStateService';
import { buildItemTree } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import { calculateMidpointSortOrder } from '@/utils/sortOrderHelpers';
import { AddItemDialog } from './AddItemDialog';
import { RootDropZone } from './RootDropZone';

interface TemplateItemEditorProps {
  template: InstanceOfSchema<typeof Template>;
  onBack: () => void;
}

export function TemplateItemEditor({ template, onBack }: TemplateItemEditorProps) {
  const { me } = useAccount<typeof Account>();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeItem, setActiveItem] = useState<TemplateItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [noteEditorState, setNoteEditorState] = useState<{
    open: boolean;
    itemId: string | null;
  }>({ open: false, itemId: null });
  const { showConfirm } = useDialog();

  // Configure sensors for drag detection
  // Use MouseSensor + TouchSensor instead of PointerSensor for proper mobile support
  // TouchSensor allows scrolling while supporting drag gestures
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms hold before drag starts (allows scrolling)
        tolerance: 8, // Allow 8px of movement during the delay
      },
    }),
  );

  if (!me || !me.root) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-divider-tertiary border-t-content-primary" />
          <p className="mt-4 text-content-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  const items = template.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Build hierarchical tree structure
  const itemTree = buildItemTree(activeItems);

  const handleAddItem = (name: string, defaultQuantity?: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createItem(me, template.$jazz.id, name, undefined, defaultQuantity);
  };

  const handleAddCategory = (name: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createCategory(me, template.$jazz.id, name, undefined);
  };

  const handleRenameItem = (itemId: string, newName: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.renameItem(me, template.$jazz.id, itemId, newName);
  };

  const handleDeleteItem = (itemId: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.archiveItem(me, template.$jazz.id, itemId);
  };

  const handleToggleExpand = (itemId: string) => {
    const item = items.find((i) => i?.id === itemId);
    if (item && item.type === 'category' && me) {
      // Use viewState for per-user category expansion (not shared with collaborators)
      viewStateService.toggleTemplateCategoryExpanded(me, template.$jazz.id, itemId);
    }
  };

  const handleEditNote = (itemId: string) => {
    setNoteEditorState({ open: true, itemId });
  };

  const handleSaveNote = (note: string) => {
    if (!me || !noteEditorState.itemId) return;
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
    ItemService.updateItemNotes(me, template.$jazz.id, noteEditorState.itemId, note);
  };

  // Get the item being edited for the note dialog
  const noteEditingItem = noteEditorState.itemId
    ? items.find((i) => i?.id === noteEditorState.itemId)
    : null;

  // Helper function to get all descendant IDs for an item (including the item itself)
  const getAllDescendantIds = (itemId: string): string[] => {
    const item = items.find((i) => i?.id === itemId);
    if (!item) return [itemId];

    const descendants = [itemId];

    // If it's a category, recursively find all children
    if (item.type === 'category') {
      const children = activeItems.filter((i) => {
        const parentPath = i.path.substring(0, i.path.lastIndexOf('/'));
        return parentPath === item.path;
      });

      for (const child of children) {
        descendants.push(...getAllDescendantIds(child.id));
      }
    }

    return descendants;
  };

  const handleToggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      const allIds = getAllDescendantIds(itemId);

      // If the item is selected, deselect it and all descendants
      if (newSet.has(itemId)) {
        for (const id of allIds) {
          newSet.delete(id);
        }
      } else {
        // Otherwise, select it and all descendants
        for (const id of allIds) {
          newSet.add(id);
        }
      }

      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(activeItems.map((item) => item.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    const confirmed = await showConfirm({
      title: 'Delete Selected Items',
      message: `${count} item${count > 1 ? 's' : ''}`,
      confirmText: 'Delete',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    // Archive all selected items
    for (const itemId of selectedIds) {
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
      ItemService.archiveItem(me, template.$jazz.id, itemId);
    }

    // Clear selection
    setSelectedIds(new Set());
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const draggedItem = event.active.data.current?.item as TemplateItem;
    setActiveItem(draggedItem);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Optional: Add visual feedback during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveItem(null);

    if (!over || !active.data.current) {
      return;
    }

    const draggedItem = active.data.current.item as TemplateItem;
    const overData = over.data.current;

    // Don't allow dropping on itself
    if (over.id === active.id) {
      return;
    }

    // Check if dropped on a reorder zone
    if (overData?.type === 'reorder-zone') {
      const currentParentPath = getParentPath(draggedItem.path);
      const targetParentPath = overData.parentPath as string | undefined;

      // Get siblings at the target level
      const siblings = activeItems.filter((item) => getParentPath(item.path) === targetParentPath);

      // Sort siblings by current sortOrder
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

      // Check if moving to a different parent folder or just reordering
      if (targetParentPath !== currentParentPath) {
        // Move and reorder in a single operation
        try {
          ItemService.moveItem(
            // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
            me,
            template.$jazz.id,
            draggedItem.id,
            targetParentPath,
            newSortOrder,
          );
        } catch {
          // Silently ignore errors (e.g., duplicate names)
        }
      } else {
        // Just reordering within the same folder
        try {
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          ItemService.reorderItem(me, template.$jazz.id, draggedItem.id, newSortOrder);
        } catch {
          // Silently ignore errors
        }
      }
      return;
    }

    // Otherwise, handle hierarchy changes (move into categories)
    let newParentPath: string | undefined;

    // IMPORTANT: Check virtual root zone FIRST
    if (overData?.path === '__ROOT_DROP_ZONE__') {
      newParentPath = undefined; // Move to root level
    } else if (overData?.isCategory) {
      // Dropped on a category - move inside it
      newParentPath = overData.path as string;
    } else if (overData?.item) {
      // Dropped on another item - move to same parent as that item
      const targetItem = overData.item as TemplateItem;
      newParentPath = getParentPath(targetItem.path);
    } else {
      // No valid drop target
      return;
    }

    // Don't move if dropped on same location
    const currentParentPath = getParentPath(draggedItem.path);
    if (newParentPath === currentParentPath) {
      return;
    }

    // Prevent moving a category into itself or its descendants
    if (draggedItem.type === 'category' && newParentPath?.startsWith(draggedItem.path)) {
      return;
    }

    try {
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
      ItemService.moveItem(me, template.$jazz.id, draggedItem.id, newParentPath);
    } catch {
      // Silently ignore expected validation errors
    }
  };

  const handleDragCancel = () => {
    setActiveItem(null);
  };

  // Recursive function to render item tree
  const renderItemNode = (
    node: ReturnType<typeof buildItemTree>[number],
    depth = 0,
    siblings: ReturnType<typeof buildItemTree> = [],
    index = 0,
  ) => {
    const { item, children } = node;
    const parentPath = getParentPath(item.path);

    return (
      <div key={item.id}>
        {/* Reorder zone before first sibling */}
        {index === 0 && (
          <ReorderDropZone
            id={`reorder-before-${item.id}`}
            beforeItemId={item.id}
            parentPath={parentPath}
            isDragging={!!activeItem}
          />
        )}
        <TemplateItemView
          item={item}
          level={depth}
          hasChildren={children.length > 0}
          isSelected={selectedIds.has(item.id)}
          onSelect={handleToggleSelect}
          onRename={handleRenameItem}
          onDelete={handleDeleteItem}
          onToggleExpand={handleToggleExpand}
          onEditNote={handleEditNote}
        />
        {/* Reorder zone after each sibling */}
        <ReorderDropZone
          id={`reorder-after-${item.id}`}
          afterItemId={item.id}
          beforeItemId={siblings[index + 1]?.item.id}
          parentPath={parentPath}
          isDragging={!!activeItem}
        />
        {/* Render children if category is expanded (using viewState for per-user expansion) */}
        {item.type === 'category' &&
          me &&
          viewStateService.getTemplateCategoryExpanded(me, template.$jazz.id, item.id) &&
          children.length > 0 && (
            <div>
              {children.map((child, childIndex) =>
                renderItemNode(child, depth + 1, children, childIndex),
              )}
            </div>
          )}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen bg-surface-secondary p-6 flex flex-col">
        <div className="mx-auto max-w-4xl w-full flex-1 flex flex-col min-h-0">
          {/* Items Tree */}
          <div className="rounded-lg border border-divider-primary bg-surface-elevated flex flex-col flex-1 min-h-0">
            {/* Root-level drop zone with header */}
            <RootDropZone
              isDragging={!!activeItem}
              folderName={template.name}
              onBack={onBack}
              onAddItem={() => setShowAddDialog(true)}
            />

            {/* Selection Toolbar */}
            {itemTree.length > 0 && (
              <div className="border-b border-divider-primary bg-surface-tertiary px-4 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="rounded px-3 py-1 text-sm text-content-secondary hover:bg-interactive-hover transition-colors"
                    >
                      Select All
                    </button>
                    {selectedIds.size > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={handleDeselectAll}
                          className="rounded px-3 py-1 text-sm text-content-secondary hover:bg-interactive-hover transition-colors"
                        >
                          Deselect All
                        </button>
                        <span className="text-sm text-content-secondary">
                          {selectedIds.size} selected
                        </span>
                      </>
                    )}
                  </div>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 transition-colors"
                    >
                      Delete Selected ({selectedIds.size})
                    </button>
                  )}
                </div>
              </div>
            )}

            {itemTree.length === 0 ? (
              <div className="p-8 text-center text-content-tertiary">
                <p>No items in this list yet.</p>
                <p className="mt-1 text-sm">Click "Add Item" to get started.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="divide-y divide-divider-secondary">
                  {itemTree.map((node, index) => renderItemNode(node, 0, itemTree, index))}
                </div>
              </div>
            )}
          </div>

          {/* Add Item Dialog */}
          <AddItemDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            onAddItem={handleAddItem}
            onAddCategory={handleAddCategory}
            folderName={template.name}
          />

          {/* Note Editor Dialog */}
          <NoteEditorDialog
            open={noteEditorState.open}
            onOpenChange={(open) => setNoteEditorState((prev) => ({ ...prev, open }))}
            itemName={noteEditingItem?.name || ''}
            note={noteEditingItem?.notes || ''}
            onSave={handleSaveNote}
            noteType="template"
          />
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className="bg-surface-elevated border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90 flex items-center gap-2">
            {activeItem.type === 'category' && <Folder className="h-4 w-4" />}
            <span className="font-medium">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

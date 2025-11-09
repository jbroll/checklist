import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Folder } from 'lucide-react';
import { useState } from 'react';
import { TemplateItemView } from '@/components/tree/TemplateItemView';
import { useAccount } from '@/lib/jazz';
import type { Account, FolderNode, TemplateItem } from '@/schemas';
import * as ItemService from '@/services/itemService';
import { buildItemTree } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import { AddItemDialog } from './AddItemDialog';
import { RootDropZone } from './RootDropZone';

interface TemplateItemEditorProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  onBack: () => void;
}

export function TemplateItemEditor({ folder, onBack }: TemplateItemEditorProps) {
  const { me } = useAccount<typeof Account>();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeItem, setActiveItem] = useState<InstanceOfSchema<typeof TemplateItem> | null>(null);

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
  );

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  const items = folder.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Build hierarchical tree structure
  const itemTree = buildItemTree(activeItems);

  const handleAddItem = (name: string, parentPath?: string, defaultQuantity?: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createItem(me, folder.$jazz.id, name, parentPath, defaultQuantity);
  };

  const handleAddCategory = (name: string, parentPath?: string, color?: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createCategory(me, folder.$jazz.id, name, parentPath, color);
  };

  const handleRenameItem = (itemId: string, newName: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.renameItem(me, folder.$jazz.id, itemId, newName);
  };

  const handleDeleteItem = (itemId: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.archiveItem(me, folder.$jazz.id, itemId);
  };

  const handleToggleExpand = (itemId: string) => {
    const item = items.find((i) => i?.$jazz.id === itemId);
    if (item && item.type === 'category') {
      item.$jazz.set('expanded', !item.expanded);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const draggedItem = event.active.data.current?.item as InstanceOfSchema<typeof TemplateItem>;
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

    const draggedItem = active.data.current.item as InstanceOfSchema<typeof TemplateItem>;
    const overData = over.data.current;

    // Don't allow dropping on itself
    if (over.id === active.id) {
      return;
    }

    // Determine the new parent path
    let newParentPath: string | undefined;

    // IMPORTANT: Check virtual root zone FIRST
    if (overData?.path === '__ROOT_DROP_ZONE__') {
      newParentPath = undefined; // Move to root level
    } else if (overData?.isCategory) {
      // Dropped on a category - move inside it
      newParentPath = overData.path as string;
    } else if (overData?.item) {
      // Dropped on another item - move to same parent as that item
      const targetItem = overData.item as InstanceOfSchema<typeof TemplateItem>;
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
      ItemService.moveItem(me, folder.$jazz.id, draggedItem.$jazz.id, newParentPath);
    } catch {
      // Silently ignore expected validation errors
    }
  };

  const handleDragCancel = () => {
    setActiveItem(null);
  };

  // Recursive function to render item tree
  const renderItemNode = (node: ReturnType<typeof buildItemTree>[number], depth = 0) => {
    const { item, children } = node;

    return (
      <div key={item.$jazz.id}>
        <TemplateItemView
          item={item}
          level={depth}
          hasChildren={children.length > 0}
          onRename={handleRenameItem}
          onDelete={handleDeleteItem}
          onToggleExpand={handleToggleExpand}
        />
        {/* Render children if category is expanded */}
        {item.type === 'category' && item.expanded && children.length > 0 && (
          <div>{children.map((child) => renderItemNode(child, depth + 1))}</div>
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
      <div className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-4xl">
          {/* Items Tree */}
          <div className="rounded-lg border border-neutral-200 bg-white">
            {/* Root-level drop zone with header */}
            <RootDropZone
              isDragging={!!activeItem}
              folderName={folder.name}
              onBack={onBack}
              onAddItem={() => setShowAddDialog(true)}
            />

            {itemTree.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <p>No items in this list yet.</p>
                <p className="mt-1 text-sm">Click "Add Item" to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {itemTree.map((node) => renderItemNode(node, 0))}
              </div>
            )}
          </div>

          {/* Add Item Dialog */}
          <AddItemDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            onAddItem={handleAddItem}
            onAddCategory={handleAddCategory}
            folderName={folder.name}
            categories={activeItems}
          />
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90 flex items-center gap-2">
            {activeItem.type === 'category' && <Folder className="h-4 w-4" />}
            <span className="font-medium">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

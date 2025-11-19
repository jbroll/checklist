import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ReorderDropZone } from '@/components/tree/ReorderDropZone';
import { TemplateItemView } from '@/components/tree/TemplateItemView';
import { useAccount } from '@/lib/jazz';
import type { Account, SessionData, Template, TemplateItem } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';
import { buildItemTree } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import { calculateMidpointSortOrder } from '@/utils/sortOrderHelpers';
import { FlatViewRenderer } from './FlatViewRenderer';
import { useSessionItems } from './useSessionItems';
import { useViewMode } from './useViewMode';
import { ZoneInHierarchyRenderer } from './ZoneInHierarchyRenderer';

interface SessionViewProps {
  template: InstanceOfSchema<typeof Template>;
  sessionId: string;
  onBack: () => void;
  onSwitchSession?: (newSessionId: string) => void;
}

export function SessionView({ template, sessionId, onBack, onSwitchSession }: SessionViewProps) {
  const { me } = useAccount<typeof Account>();
  const [activeItem, setActiveItem] = useState<TemplateItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null); // Insertion point in ADDING mode
  const [currentItemId, setCurrentItemId] = useState<string | null>(null); // Current item in NORMAL mode
  const [newItemType, setNewItemType] = useState<'item' | 'category'>('item'); // Type for new items
  const [zoneExpanded, setZoneExpanded] = useState({
    selected: true,
    checked: false,
  });

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
  );

  // Get session early (before hooks)
  const sessions = template.sessions || [];
  const session = (sessions.find((s) => s?.id === sessionId) as SessionData | undefined) || null;

  // Use hooks for partitioning items (must be before any returns)
  const { selectedItems, checkedItems } = useSessionItems({
    template,
    session,
  });

  // Use hook for view mode management (must be before any returns)
  const { currentViewMode, cycleViewMode, getViewModeLabel, getViewModeIcon } = useViewMode({
    template,
    session,
    sessionId,
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    me,
  });

  // Early returns after all hooks
  if (!me || !me.root) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-600">Session not found</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const items = template.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Initialize category expanded state from session data
  const categoryExpanded: Record<string, boolean> = session.categoryExpanded || {};

  // Build hierarchical tree structure
  const itemTree = buildItemTree(activeItems);

  const handleRenameItem = (itemId: string, newName: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    templateService.renameItem(me, template.$jazz.id, itemId, newName);
  };

  const handleDeleteItem = (itemId: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    templateService.archiveItem(me, template.$jazz.id, itemId);
  };

  const handleToggleExpand = (itemId: string) => {
    const item = items.find((i) => i?.id === itemId);
    if (item && item.type === 'category') {
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
      templateService.toggleCategoryExpanded(me, template.$jazz.id, itemId);
    }
  };

  const handleToggleSelected = (itemId: string) => {
    // Use the session service to toggle selected state
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, itemId);
  };

  const handleToggleChecked = (itemId: string) => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemChecked(me, template.$jazz.id, sessionId, itemId);
  };

  const handleToggleCategoryExpanded = (catKey: string) => {
    if (!session || !me) return;
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleCategoryExpanded(me, template.$jazz.id, sessionId, catKey);
  };

  const handleClearOrNew = () => {
    if (!me) return;

    // Check if any items are selected or checked
    const hasCheckedItems = selectedItems.length > 0 || checkedItems.length > 0;

    if (hasCheckedItems) {
      // Create a new session
      // @ts-expect-error Jazz TypeScript inference issue with Account root type
      const newSessionId = SessionService.createSession(me, template.$jazz.id);
      // Switch to the new session if callback is provided
      if (onSwitchSession) {
        onSwitchSession(newSessionId);
      }
    } else {
      // Clear all selections in current session
      // @ts-expect-error Jazz TypeScript inference issue with Account root type
      SessionService.clearSessionState(me, template.$jazz.id, sessionId);
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newItemName.trim();
    if (!trimmedName) return;

    // Calculate insertion point based on selected item
    const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
      template,
      selectedItemId,
    );

    // Add item or category based on toggle
    const newItemId =
      newItemType === 'category'
        ? templateService.createCategory(
            // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
            me,
            template.$jazz.id,
            trimmedName,
            parentPath,
            sortOrder,
          )
        : templateService.createItem(
            // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
            me,
            template.$jazz.id,
            trimmedName,
            parentPath,
            '',
            sortOrder,
          );

    setNewItemName('');
    // Select the newly created item for consecutive insertion
    setSelectedItemId(newItemId);
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const draggedItem = event.active.data.current?.item as TemplateItem;
    setActiveItem(draggedItem);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveItem(null);

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
        if (targetParentPath?.startsWith(draggedItem.path)) {
          return;
        }
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
        // Just reordering within the same parent
        try {
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          templateService.reorderItem(me, template.$jazz.id, draggedItem.id, newSortOrder);
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
      const categoryItems = activeItems.filter(
        (item) => getParentPath(item.path) === newParentPath,
      );
      categoryItems.sort((a, b) => a.sortOrder - b.sortOrder);

      // Calculate sortOrder to insert before first item
      const firstItemSortOrder = categoryItems.length > 0 ? categoryItems[0].sortOrder : undefined;
      const newSortOrder = calculateMidpointSortOrder(undefined, firstItemSortOrder);

      try {
        templateService.moveItem(
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
          me,
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
          isSelected={
            showAddForm
              ? selectedItemId === item.id // Insertion point highlight in ADDING mode
              : currentItemId === item.id // Current item highlight in NORMAL mode
          }
          isChecked={session.itemStates?.[item.id]?.selected ?? false}
          onSelect={
            showAddForm
              ? () => {
                  setSelectedItemId(selectedItemId === item.id ? null : item.id);
                }
              : (itemId: string) => {
                  // In NORMAL mode: clicking row sets current item
                  setCurrentItemId(currentItemId === itemId ? null : itemId);
                }
          }
          onCheckboxToggle={handleToggleSelected}
          onRename={handleRenameItem}
          onDelete={handleDeleteItem}
          onToggleExpand={handleToggleExpand}
          showDeleteIcon={showAddForm}
          enableDrag={showAddForm}
          enableEdit={showAddForm}
          showCheckbox={!showAddForm}
        />
        {/* Reorder zone after each sibling */}
        <ReorderDropZone
          id={`reorder-after-${item.id}`}
          afterItemId={item.id}
          beforeItemId={siblings[index + 1]?.item.id}
          parentPath={parentPath}
          isDragging={!!activeItem}
        />
        {/* Render children if category is expanded */}
        {item.type === 'category' && item.expanded && children.length > 0 && (
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
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen bg-neutral-50 p-3 sm:p-4 lg:p-6 flex flex-col">
        <div className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0">
          <div className="rounded-lg border border-neutral-200 bg-white flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="border-b border-neutral-200 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-lg font-semibold text-neutral-900 sm:text-xl lg:text-2xl">{template.name}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* New Button */}
                  {!showAddForm && (
                    <button
                      type="button"
                      onClick={handleClearOrNew}
                      className="rounded border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                    >
                      New
                    </button>
                  )}
                  {/* View Mode Toggle */}
                  {!showAddForm && (
                    <button
                      type="button"
                      onClick={cycleViewMode}
                      className="flex items-center justify-center rounded bg-neutral-100 p-3 text-neutral-700 hover:bg-neutral-200 min-h-[44px] min-w-[44px]"
                      aria-label={`Switch to ${getViewModeLabel()} view`}
                    >
                      {(() => {
                        const Icon = getViewModeIcon();
                        return <Icon className="h-5 w-5" />;
                      })()}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 rounded bg-green-600 px-4 py-2.5 text-sm text-white hover:bg-green-700 min-h-[44px]"
                    aria-label={showAddForm ? 'Cancel' : 'Add and edit items'}
                  >
                    {showAddForm ? (
                      <>
                        <X className="h-5 w-5" />
                        <span>Cancel</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-5 w-5" />
                        <Pencil className="h-5 w-5" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded bg-green-600 px-4 py-2.5 text-sm text-white hover:bg-green-700 min-h-[44px]"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>

            {/* Add Item Form */}
            {showAddForm && (
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <form onSubmit={handleAddItem} className="flex gap-2">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder={newItemType === 'category' ? 'Category name...' : 'Item name...'}
                    className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <div className="flex items-center gap-3 rounded border border-neutral-300 bg-white px-3 py-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="itemType"
                        value="item"
                        checked={newItemType === 'item'}
                        onChange={(e) => setNewItemType(e.target.value as 'item' | 'category')}
                        className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-neutral-700">Item</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="itemType"
                        value="category"
                        checked={newItemType === 'category'}
                        onChange={(e) => setNewItemType(e.target.value as 'item' | 'category')}
                        className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-neutral-700">Category</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="flex items-center justify-center rounded bg-green-600 px-3 py-2 text-white hover:bg-green-700"
                    aria-label="Add item"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </form>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Selected and Checked Zones - rendered based on view mode */}
              {!showAddForm && currentViewMode === 'flat' && (
                <FlatViewRenderer
                  template={template}
                  session={session}
                  selectedItems={selectedItems}
                  checkedItems={checkedItems}
                  zoneExpanded={{ selected: zoneExpanded.selected, checked: zoneExpanded.checked }}
                  onToggleZoneExpanded={(zone) =>
                    setZoneExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }))
                  }
                  onToggleSelected={handleToggleSelected}
                  onToggleChecked={handleToggleChecked}
                  showDeleteIcon={false}
                  onDeleteItem={handleDeleteItem}
                  interactionMode={{ mode: 'normal' }}
                  onEnterEditMode={() => {}}
                  onExitEditMode={() => {}}
                  canEdit={() => false}
                  canDrag={() => false}
                />
              )}

              {/* Zone-in-hierarchy mode */}
              {!showAddForm && currentViewMode === 'zone-in-hierarchy' && (
                <ZoneInHierarchyRenderer
                  template={template}
                  session={session}
                  selectedItems={selectedItems}
                  checkedItems={checkedItems}
                  categoryExpanded={categoryExpanded}
                  onToggleCategoryExpanded={handleToggleCategoryExpanded}
                  onToggleSelected={handleToggleSelected}
                  onToggleChecked={handleToggleChecked}
                  showDeleteIcon={false}
                  onDeleteItem={handleDeleteItem}
                  interactionMode={{ mode: 'normal' }}
                  onEnterEditMode={() => {}}
                  onExitEditMode={() => {}}
                  canEdit={() => false}
                  canDrag={() => false}
                />
              )}

              {/* Available Zone (List) */}
              {itemTree.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 bg-blue-50">
                  <p>No items in this list yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100 bg-blue-50 p-4">
                  {itemTree.map((node, index) => renderItemNode(node, 0, itemTree, index))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

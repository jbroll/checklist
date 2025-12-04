import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Package, Pencil, Plus } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { ReorderDropZone } from '@/components/tree/ReorderDropZone';
import { TemplateItemView } from '@/components/tree/TemplateItemView';
import { ItemInput, type ItemInputValue } from '@/components/ui/ItemInput';
import { useAccount } from '@/lib/jazz';
import type { Account, SessionData, Template, TemplateItem } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';
import * as userSettingsService from '@/services/userSettingsService';
import * as viewStateService from '@/services/viewStateService';
import { buildItemTree } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import { calculateMidpointSortOrder } from '@/utils/sortOrderHelpers';
import { FlatViewRenderer } from './FlatViewRenderer';
import { NoteEditorDialog } from './NoteEditorDialog';
import { SessionZone } from './SessionZone';
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null); // Insertion point in ADDING mode
  const [currentItemId, setCurrentItemId] = useState<string | null>(null); // Current item in NORMAL mode
  const [zoneExpanded, setZoneExpanded] = useState({
    available: true,
    selected: true,
    checked: false,
  });
  // Note editor state
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [noteEditingItemId, setNoteEditingItemId] = useState<string | null>(null);
  const [noteEditingZone, setNoteEditingZone] = useState<'available' | 'selected' | 'checked'>(
    'available',
  );

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

  // Scroll preservation refs and state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const availableZoneRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const prevSelectedCountRef = useRef(0);
  const prevCheckedCountRef = useRef(0);
  const savedScrollInfoRef = useRef<{
    availableZoneTop: number; // Distance from container top to available zone top
  } | null>(null);

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

  // Scroll preservation logic - runs synchronously after DOM updates but before paint
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;
    if (!container || !availableZone || showAddForm) return;

    // Update prev counts for next render
    prevSelectedCountRef.current = selectedItems.length;
    prevCheckedCountRef.current = checkedItems.length;

    // If we have saved scroll info, restore the Available zone position
    if (savedScrollInfoRef.current) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Calculate where the Available zone is NOW
      const currentAvailableTop = availableRect.top - containerRect.top;

      // Calculate where we WANT it to be (same as before)
      const targetAvailableTop = savedScrollInfoRef.current.availableZoneTop;

      // Calculate the difference
      const diff = currentAvailableTop - targetAvailableTop;

      // Adjust scroll to keep Available zone in the same viewport position
      // This must happen synchronously in useLayoutEffect to prevent visual bounce
      if (Math.abs(diff) > 0.5) {
        container.scrollTop = container.scrollTop + diff;
      }

      // Clear saved info after applying
      savedScrollInfoRef.current = null;
    }
  }, [selectedItems.length, checkedItems.length, showAddForm]);

  // Early returns after all hooks
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

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-content-secondary">Session not found</p>
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

  // Get category expanded state from viewState (per-user, not shared)
  // For session view, we use templateCategoryExpanded keyed by template ID
  const templateCategoryExpanded: Record<string, boolean> =
    me?.root?.viewState?.templateCategoryExpanded?.[template.$jazz.id] || {};

  // Helper to check if a category is expanded (from viewState, defaults to true)
  const isCategoryExpanded = (itemId: string): boolean => {
    return templateCategoryExpanded[itemId] ?? true;
  };

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
    if (item && item.type === 'category' && me) {
      // Use viewState for per-user category expansion in template editor
      viewStateService.toggleTemplateCategoryExpanded(me, template.$jazz.id, itemId);
    }
  };

  const handleToggleSelected = (itemId: string) => {
    // Capture Available zone position BEFORE the state change
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;

    if (container && availableZone) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Save where the Available zone currently is in the viewport
      savedScrollInfoRef.current = {
        availableZoneTop: availableRect.top - containerRect.top,
      };
    }

    // Use the session service to toggle selected state
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, itemId);
  };

  const handleToggleChecked = (itemId: string) => {
    // Capture Available zone position BEFORE the state change
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;

    if (container && availableZone) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Save where the Available zone currently is in the viewport
      savedScrollInfoRef.current = {
        availableZoneTop: availableRect.top - containerRect.top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemChecked(me, template.$jazz.id, sessionId, itemId);
  };

  const handleToggleCategoryExpanded = (catKey: string) => {
    if (!session || !me) return;
    // Use viewState for per-user category expansion (not shared with collaborators)
    // Use template-based expansion so category state is consistent across all views
    viewStateService.toggleTemplateCategoryExpanded(me, template.$jazz.id, catKey);
  };

  const handleBatchSelectAll = (itemIds: string[]) => {
    if (!me) return;

    // Capture Available zone position BEFORE the state change
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;

    if (container && availableZone) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Save where the Available zone currently is in the viewport
      savedScrollInfoRef.current = {
        availableZoneTop: availableRect.top - containerRect.top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, true);
  };

  const handleBatchDeselectAll = (itemIds: string[]) => {
    if (!me) return;

    // Capture Available zone position BEFORE the state change
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;

    if (container && availableZone) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Save where the Available zone currently is in the viewport
      savedScrollInfoRef.current = {
        availableZoneTop: availableRect.top - containerRect.top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, false);
  };

  const handleBatchToggle = (itemIds: string[]) => {
    if (!me) return;

    // Capture Available zone position BEFORE the state change
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;

    if (container && availableZone) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Save where the Available zone currently is in the viewport
      savedScrollInfoRef.current = {
        availableZoneTop: availableRect.top - containerRect.top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.invertItemSelection(me, template.$jazz.id, sessionId, itemIds);
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

  // Note editing handlers
  const handleEditNoteInZone = (zone: 'available' | 'selected' | 'checked') => (itemId: string) => {
    setNoteEditingItemId(itemId);
    setNoteEditingZone(zone);
    setNoteEditorOpen(true);
  };

  const handleSaveNote = (note: string) => {
    if (!me || !noteEditingItemId) return;

    if (noteEditingZone === 'available') {
      // Save template note
      // @ts-expect-error Jazz TypeScript inference issue with Account root type
      templateService.updateItemNotes(me, template.$jazz.id, noteEditingItemId, note);
    } else {
      // Save session note
      SessionService.updateSessionItemNotes(
        // @ts-expect-error Jazz TypeScript inference issue with Account root type
        me,
        template.$jazz.id,
        sessionId,
        noteEditingItemId,
        note,
      );
    }
  };

  // Get current note values for the editor
  const noteEditingItem = noteEditingItemId
    ? activeItems.find((i) => i.id === noteEditingItemId)
    : null;
  const noteEditingCurrentNote =
    noteEditingZone === 'available'
      ? noteEditingItem?.notes || ''
      : session?.itemStates?.[noteEditingItemId || '']?.notes || '';
  const noteEditingTemplateNote =
    noteEditingZone !== 'available' ? noteEditingItem?.notes : undefined;

  const handleAddItem = (value: ItemInputValue) => {
    // For categories, use standard insertion point logic
    if (value.type === 'category') {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        template,
        selectedItemId,
      );
      const newItemId = templateService.createCategory(
        // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
        me,
        template.$jazz.id,
        value.name,
        parentPath,
        sortOrder,
      );
      setSelectedItemId(newItemId);
      return;
    }

    // For items, check if auto-categorization is enabled
    const autoCategorizeEnabled = userSettingsService.getTemplateAutoCategorizeEnabled(
      me,
      template,
    );

    let finalParentPath: string | undefined;
    let finalSortOrder: number | undefined;

    // If categoryInfo provided and auto-categorization is enabled, place item in category
    if (value.categoryInfo && autoCategorizeEnabled) {
      // Use the most specific category available (subcategory if exists, otherwise category)
      const categoryName = value.categoryInfo.subcategoryName || value.categoryInfo.categoryName;

      // Find existing category with this name at root level (path equals the name for root-level items)
      const existingCategory = activeItems.find(
        (item) =>
          item.type === 'category' && item.name === categoryName && item.path === categoryName,
      );

      if (existingCategory) {
        // Use existing category's path
        finalParentPath = existingCategory.path;
      } else {
        // Create the category first
        // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
        templateService.createCategory(me, template.$jazz.id, categoryName, undefined);

        // For root-level categories, path equals the category name (no sanitization)
        finalParentPath = categoryName;
      }
      // Let sortOrder be computed automatically (append to end of category)
    } else {
      // No auto-categorization - use standard insertion point logic
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        template,
        selectedItemId,
      );
      finalParentPath = parentPath;
      finalSortOrder = sortOrder;
    }

    const newItemId = templateService.createItem(
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
      me,
      template.$jazz.id,
      value.name,
      finalParentPath,
      value.defaultQuantity || '',
      finalSortOrder,
    );

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

  // Helper to collect all item IDs from a category tree (for batch operations)
  const collectCategoryItemIds = (node: ReturnType<typeof buildItemTree>[number]): string[] => {
    const ids: string[] = [];

    // Add items from this node and all children recursively
    const collect = (n: ReturnType<typeof buildItemTree>[number]) => {
      if (n.item.type === 'item') {
        ids.push(n.item.id);
      }
      n.children.forEach(collect);
    };

    collect(node);
    return ids;
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

    // For categories in normal mode (not edit mode), use SessionZone to get batch operation icons
    if (item.type === 'category' && !showAddForm) {
      const categoryItemIds = collectCategoryItemIds(node);

      // Get all items for this category (needed for SessionZone to calculate selection state)
      const categoryItems = activeItems.filter((i) => categoryItemIds.includes(i.id));

      return (
        <div key={item.id}>
          <SessionZone
            title={item.name}
            zone="available"
            items={categoryItems}
            itemStates={session.itemStates || {}}
            expanded={isCategoryExpanded(item.id)}
            onToggleExpand={() => handleToggleExpand(item.id)}
            onToggleSelected={handleToggleSelected}
            onToggleChecked={handleToggleChecked}
            onBatchSelectAll={handleBatchSelectAll}
            onBatchDeselectAll={handleBatchDeselectAll}
            onBatchToggle={handleBatchToggle}
            count={categoryItemIds.length}
            categoryItem={item}
            template={template}
            onEditNote={handleEditNoteInZone('available')}
          >
            <div className="pl-4">
              {children.map((child, childIndex) =>
                renderItemNode(child, depth + 1, children, childIndex),
              )}
            </div>
          </SessionZone>
        </div>
      );
    }

    // For items or categories in edit mode, use TemplateItemView
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
          expanded={item.type === 'category' ? isCategoryExpanded(item.id) : undefined}
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
          onEditNote={!showAddForm ? handleEditNoteInZone('available') : undefined}
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
        {item.type === 'category' && isCategoryExpanded(item.id) && children.length > 0 && (
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
      <div className="h-screen bg-surface-secondary p-3 sm:p-4 lg:p-6 flex flex-col">
        <div className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0">
          <div className="rounded-lg border border-divider-primary bg-surface-elevated flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="border-b border-divider-primary p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-content-primary sm:text-xl lg:text-2xl truncate">
                  {template.name}
                </h1>
                {showAddForm ? (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded bg-green-600 px-4 py-2 text-base text-white hover:bg-green-700 min-h-[44px] shrink-0"
                  >
                    Done
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* New Button */}
                    <button
                      type="button"
                      onClick={handleClearOrNew}
                      className="rounded border border-divider-primary bg-surface-elevated px-4 py-2 text-base font-medium text-content-primary hover:bg-interactive-hover min-h-[44px]"
                    >
                      New
                    </button>
                    {/* View Mode Toggle */}
                    <button
                      type="button"
                      onClick={cycleViewMode}
                      className="flex items-center justify-center rounded bg-surface-tertiary p-3 text-content-primary hover:bg-interactive-hover min-h-[44px] min-w-[44px]"
                      aria-label={`Switch to ${getViewModeLabel()} view`}
                    >
                      {(() => {
                        const Icon = getViewModeIcon();
                        return <Icon className="h-5 w-5" />;
                      })()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-1.5 rounded bg-green-600 px-4 py-2 text-base text-white hover:bg-green-700 min-h-[44px]"
                      aria-label="Add and edit items"
                    >
                      <Plus className="h-5 w-5" />
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={onBack}
                      className="rounded bg-green-600 px-4 py-2 text-base text-white hover:bg-green-700 min-h-[44px]"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Add Item Form */}
            {showAddForm && (
              <div className="border-b border-divider-primary bg-surface-secondary px-3 py-3 sm:px-4">
                <ItemInput
                  onSubmit={handleAddItem}
                  onCancel={() => setShowAddForm(false)}
                  showTypeToggle={true}
                  showQuantityField={false}
                  clearOnSubmit={true}
                  autoFocus={true}
                  autocompleteDomain={template.autocompleteDomain ?? 'grocery'}
                />
              </div>
            )}

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto min-h-0"
              style={{ scrollBehavior: 'auto' }}
            >
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
                  onEditNote={handleEditNoteInZone('selected')}
                />
              )}

              {/* Zone-in-hierarchy mode */}
              {!showAddForm && currentViewMode === 'zone-in-hierarchy' && (
                <ZoneInHierarchyRenderer
                  template={template}
                  session={session}
                  selectedItems={selectedItems}
                  checkedItems={checkedItems}
                  categoryExpanded={templateCategoryExpanded}
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
                  onEditNote={handleEditNoteInZone('selected')}
                />
              )}

              {/* Available Items Zone */}
              {itemTree.length === 0 ? (
                <div className="p-8 text-center text-content-tertiary bg-blue-50 dark:bg-blue-900/20">
                  <p>No items in this list yet.</p>
                </div>
              ) : (
                <div ref={availableZoneRef} className="bg-blue-50 dark:bg-blue-900/20 p-4">
                  <SessionZone
                    title="Available Items"
                    icon={Package}
                    zone="available"
                    items={activeItems}
                    itemStates={session.itemStates || {}}
                    expanded={zoneExpanded.available}
                    onToggleExpand={() =>
                      setZoneExpanded((prev) => ({ ...prev, available: !prev.available }))
                    }
                    onToggleSelected={handleToggleSelected}
                    onToggleChecked={handleToggleChecked}
                    onBatchSelectAll={!showAddForm ? handleBatchSelectAll : undefined}
                    onBatchDeselectAll={!showAddForm ? handleBatchDeselectAll : undefined}
                    onBatchToggle={!showAddForm ? handleBatchToggle : undefined}
                    count={activeItems.length}
                    showHeading={!showAddForm}
                    onEditNote={handleEditNoteInZone('available')}
                  >
                    <div className="divide-y divide-divider-secondary">
                      {/* Invisible anchor element for scroll preservation */}
                      <div ref={anchorRef} className="h-0" />
                      {itemTree.map((node, index) => renderItemNode(node, 0, itemTree, index))}
                    </div>
                  </SessionZone>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className="bg-surface-elevated border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Note Editor Dialog */}
      <NoteEditorDialog
        open={noteEditorOpen}
        onOpenChange={setNoteEditorOpen}
        itemName={noteEditingItem?.name || ''}
        note={noteEditingCurrentNote}
        templateNote={noteEditingTemplateNote}
        onSave={handleSaveNote}
        noteType={noteEditingZone === 'available' ? 'template' : 'session'}
      />
    </DndContext>
  );
}

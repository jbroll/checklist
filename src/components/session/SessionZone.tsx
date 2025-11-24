import type { InstanceOfSchema } from 'jazz-tools';
import type { LucideIcon } from 'lucide-react';
import { ListChecks, ListMinus, ListX } from 'lucide-react';
import { useRef, useState } from 'react';
import { IndentedRow } from '@/components/tree/IndentedRow';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAccount } from '@/lib/jazz';
import { useDoubleTap } from '@/lib/useDoubleTap';
import type { InteractionMode } from '@/lib/useSessionInteractionMode';
import type { Account, FolderNode, ItemState, TemplateItem } from '@/schemas';
import * as templateService from '@/services/templateService';
import type { CategoryNode } from './categoryTreeBuilder';
import { collectAllItemIds, getSelectionState } from './categoryTreeUtils';
import { SessionItemRow } from './SessionItemRow';

interface SessionZoneProps {
  title: string;
  icon?: LucideIcon;
  zone: 'available' | 'selected' | 'checked';
  items: TemplateItem[];
  itemStates: Record<string, ItemState>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  onBatchSelectAll?: (itemIds: string[]) => void;
  onBatchDeselectAll?: (itemIds: string[]) => void;
  onBatchToggle?: (itemIds: string[]) => void;
  count?: number;
  children?: React.ReactNode;
  showHeading?: boolean; // Controls whether to show the zone heading
  isTopLevelZone?: boolean; // Controls whether this is a top-level zone (for styling)
  category?: CategoryNode | null; // Category node for batch operations
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  categoryItem?: TemplateItem; // The actual category item for selection
  isSelected?: boolean; // Category selection state
  onSelectItem?: (itemId: string | null) => void; // Category selection handler
  template?: InstanceOfSchema<typeof FolderNode>; // Template for inline editing
  // Interaction mode props (centralized state management)
  isEditingThisItem?: boolean; // Is this specific category being edited
  canEditItem?: boolean; // Can edit this category in current mode
  canDragItem?: boolean; // Can drag items in this zone in current mode
  onEnterEditMode?: () => void; // Enter edit mode for this category
  onExitEditMode?: () => void; // Exit edit mode for this category
  // Interaction mode props for child items (when rendering items directly)
  interactionMode?: InteractionMode; // InteractionMode from parent
  onEnterItemEditMode?: (itemId: string) => void; // Enter edit mode for an item
  onExitItemEditMode?: () => void; // Exit edit mode for an item
  canEditItemFn?: (itemId: string) => boolean; // Can edit a specific item
  canDragItemFn?: (itemId: string) => boolean; // Can drag a specific item
}

export function SessionZone({
  title,
  icon: Icon,
  zone,
  items,
  itemStates,
  expanded,
  onToggleExpand,
  onToggleSelected,
  onToggleChecked,
  onBatchSelectAll,
  onBatchDeselectAll,
  onBatchToggle,
  count,
  children,
  showHeading = true,
  isTopLevelZone = false,
  category,
  showDeleteIcon = false,
  onDeleteItem,
  categoryItem,
  isSelected = false,
  onSelectItem,
  template,
  isEditingThisItem = false,
  canEditItem = true,
  onEnterEditMode,
  onExitEditMode,
  interactionMode,
  onEnterItemEditMode,
  onExitItemEditMode,
  canEditItemFn,
  canDragItemFn,
}: SessionZoneProps) {
  const { me } = useAccount<typeof Account>();
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Use centralized editing state instead of local state
  const isEditing = isEditingThisItem;

  // Inline editing handlers for category name with double-tap support for mobile
  const doubleTapHandlers = useDoubleTap({
    onDoubleTap: (e) => {
      // Only enable for categories when template is available
      if (!template || !categoryItem) return;

      // Check if editing is allowed in current mode
      if (!canEditItem) {
        return;
      }

      // Don't trigger if clicking on buttons or expand toggle
      if (
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('[data-expand-toggle]')
      ) {
        return;
      }

      setEditValue(title);
      onEnterEditMode?.();
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    },
  });

  const handleSaveEdit = () => {
    if (!me || !template || !categoryItem) return;

    const trimmedValue = editValue.trim();

    // Validate non-empty
    if (!trimmedValue) {
      onExitEditMode?.();
      return;
    }

    // Only save if changed
    if (trimmedValue !== title) {
      try {
        // @ts-expect-error Jazz TypeScript inference issue with Account root type
        templateService.renameItem(me, template.$jazz.id, categoryItem.id, trimmedValue);
      } catch (error) {
        console.error('[SessionZone] Failed to rename category:', error);
      }
    }

    onExitEditMode?.();
  };

  const handleCancelEdit = () => {
    onExitEditMode?.();
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Determine background class based on zone type - only for top-level available zone
  const bgClass = zone === 'available' && isTopLevelZone ? 'bg-blue-50 rounded-md' : '';
  // Remove padding - let parent control all padding
  const paddingClass = '';

  // Get all item IDs for batch operations
  const allItemIds = category ? collectAllItemIds(category) : items.map((i) => i.id);
  const selectionState = category
    ? getSelectionState(category, itemStates)
    : getSelectionState(null, itemStates, items);

  // Calculate selected count for "N of M" display
  const selectedCount = allItemIds.filter(
    (id) => itemStates[id]?.selected || itemStates[id]?.checked,
  ).length;
  const totalCount = allItemIds.length;

  // Content to render (items or children)
  const content = children ? (
    children
  ) : (
    <div className="flex flex-col">
      {items.map((item) => (
        <SessionItemRow
          key={item.id}
          item={item}
          state={itemStates[item.id] || null}
          zone={zone}
          onToggleSelected={onToggleSelected}
          onToggleChecked={onToggleChecked}
          showDeleteIcon={showDeleteIcon}
          onDeleteItem={onDeleteItem}
          template={template}
          // Interaction mode props for item editing
          isEditingThisItem={
            interactionMode &&
            interactionMode.mode === 'editing' &&
            interactionMode.itemId === item.id
          }
          canEditItem={canEditItemFn?.(item.id)}
          canDragItem={canDragItemFn?.(item.id)}
          isAnyItemBeingEditedOrDragged={
            interactionMode ? interactionMode.mode !== 'normal' : false
          }
          onEnterEditMode={onEnterItemEditMode ? () => onEnterItemEditMode(item.id) : undefined}
          onExitEditMode={onExitItemEditMode}
        />
      ))}
    </div>
  );

  // If headings are disabled, show content directly
  if (!showHeading) {
    return <div className={bgClass}>{content}</div>;
  }

  // Render batch selection buttons - always show all three
  const renderBatchButtons = () => {
    if (
      !onBatchSelectAll ||
      !onBatchDeselectAll ||
      !onBatchToggle ||
      allItemIds.length === 0 ||
      zone !== 'available'
    )
      return null;

    const handleSelectAll = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onBatchSelectAll && allItemIds.length > 0 && selectionState !== 'all') {
        onBatchSelectAll(allItemIds);
      }
    };

    const handleDeselectAll = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onBatchDeselectAll && allItemIds.length > 0 && selectionState !== 'none') {
        onBatchDeselectAll(allItemIds);
      }
    };

    const handleToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onBatchToggle && allItemIds.length > 0) {
        onBatchToggle(allItemIds);
      }
    };

    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1">
          {/* Select All */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={selectionState === 'all'}
                className="rounded p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ListChecks className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Select all items</p>
            </TooltipContent>
          </Tooltip>

          {/* Toggle Selection */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggle}
                className="rounded p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ListMinus className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle selection</p>
            </TooltipContent>
          </Tooltip>

          {/* Deselect All */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selectionState === 'none'}
                className="rounded p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ListX className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Deselect all items</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  };

  const handleCategoryClick = (e: React.MouseEvent) => {
    // Don't trigger selection if clicking on buttons or expand toggle
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('[data-expand-toggle]')
    ) {
      return;
    }

    if (onSelectItem && categoryItem) {
      const newValue = isSelected ? null : categoryItem.id;
      onSelectItem(newValue);
    }
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent) => {
    // Support Enter and Space keys
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSelectItem && categoryItem) {
        const newValue = isSelected ? null : categoryItem.id;
        onSelectItem(newValue);
      }
    }
  };

  // Normal mode with collapsible header
  return (
    <div className={`${bgClass} ${paddingClass}`}>
      {/* Zone header */}
      <IndentedRow
        level={0}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        hasChildren={items.length > 0 || !!children}
      >
        <div
          className={`flex items-center gap-2 w-full rounded ${
            isSelected ? 'bg-neutral-200' : onSelectItem ? 'hover:bg-neutral-100' : ''
          } ${onSelectItem ? 'cursor-pointer' : ''}`}
          {...(onSelectItem && {
            onClick: handleCategoryClick,
            onKeyDown: handleCategoryKeyDown,
            role: 'button' as const,
            tabIndex: 0,
          })}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-1 text-sm font-semibold text-neutral-900 border-2 border-blue-400 rounded bg-blue-50 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <span
              className="flex-1 text-sm font-semibold text-neutral-900 text-left"
              {...doubleTapHandlers}
            >
              {title}
            </span>
          )}
          {count !== undefined && totalCount > 0 && (
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm font-medium text-neutral-700">
              {selectedCount} of {totalCount}
            </span>
          )}
          {renderBatchButtons()}
          {/* Delete button for category - only in edit mode */}
          {showDeleteIcon && categoryItem && onDeleteItem && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteItem(categoryItem.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded border-2 border-neutral-300 text-neutral-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete category"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                role="img"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </IndentedRow>

      {/* Zone items - no animations to avoid scroll jumping */}
      {expanded && <div className="overflow-hidden">{content}</div>}
    </div>
  );
}

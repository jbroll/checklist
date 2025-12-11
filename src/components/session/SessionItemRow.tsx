import { useDraggable } from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { StickyNote } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useAccount } from '@/lib/jazz';
import { useDoubleTap } from '@/lib/useDoubleTap';
import type { Account, FolderNode, ItemState, TemplateItem } from '@/schemas';
import * as templateService from '@/services/templateService';

interface SessionItemRowProps {
  item: TemplateItem;
  state: ItemState | null;
  zone: 'available' | 'selected' | 'checked';
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  isSelected?: boolean; // For insertion point selection
  onSelectItem?: (itemId: string | null) => void; // For insertion point selection
  enableDrag?: boolean; // Enable drag and drop in available zone
  template?: InstanceOfSchema<typeof FolderNode>; // Template for inline editing
  // Interaction mode props (centralized state management)
  isEditingThisItem?: boolean; // Is this specific item being edited
  canEditItem?: boolean; // Can edit this item in current mode
  canDragItem?: boolean; // Can drag this item in current mode
  isAnyItemBeingEditedOrDragged?: boolean; // Is any item being edited or dragged (disables checkboxes)
  onEnterEditMode?: () => void; // Enter edit mode for this item
  onExitEditMode?: () => void; // Exit edit mode for this item
  // Notes
  onEditNote?: (itemId: string) => void; // Open note editor dialog
  showNotesIcon?: boolean; // Show notes icon (defaults to true when onEditNote provided)
}

export const SessionItemRow = memo(function SessionItemRow({
  item,
  state,
  zone,
  onToggleSelected,
  onToggleChecked,
  showDeleteIcon = false,
  onDeleteItem,
  isSelected: isInsertionPointSelected = false,
  onSelectItem,
  enableDrag = false,
  template,
  isEditingThisItem = false,
  canEditItem = true,
  canDragItem = true,
  isAnyItemBeingEditedOrDragged = false,
  onEnterEditMode,
  onExitEditMode,
  onEditNote,
  showNotesIcon,
}: SessionItemRowProps) {
  const { me } = useAccount<typeof Account>();
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const justEnteredEditMode = useRef(false);

  // Use centralized editing state instead of local state
  const isEditing = isEditingThisItem;

  // Draggable setup - only in available zone when enabled AND mode allows dragging
  const dragDisabled = !enableDrag || !canDragItem;

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
    disabled: dragDisabled,
  });

  // Long press visual feedback - DISABLED to avoid conflicting with drag sensor
  // const { isHolding, longPressHandlers } = useLongPressIndicator(isDragging);
  const isHolding = false;
  const longPressHandlers = {};

  // Inline editing handlers with double-tap support for mobile
  const doubleTapHandlers = useDoubleTap({
    onDoubleTap: (e) => {
      // Only enable when template is available
      if (!template) return;

      // Check if editing is allowed in current mode
      if (!canEditItem) {
        const timestamp = (performance.now() / 1000).toFixed(3);
        console.log(`[${timestamp}s] [SessionItemRow] Cannot edit - canEditItem is false`);
        return;
      }

      // Don't trigger if clicking on buttons
      if ((e.target as HTMLElement).closest('button')) return;

      const timestamp = (performance.now() / 1000).toFixed(3);
      console.log(
        `[${timestamp}s] [SessionItemRow] Double-tap detected, entering edit mode for:`,
        item.name,
      );
      setEditValue(item.name);
      justEnteredEditMode.current = true;
      onEnterEditMode?.();
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        // Clear the flag after a brief delay to allow focus to settle
        setTimeout(() => {
          justEnteredEditMode.current = false;
        }, 100);
      }, 0);
    },
  });

  if (!me) return null;

  // Only leaf items should be shown in shopping sessions
  if (item.type === 'category') return null;

  const isSelected = state?.selected || false;
  const isChecked = state?.checked || false;

  // Determine which state the left checkbox controls based on zone
  const leftCheckboxControlsChecked = zone === 'selected' || zone === 'checked';
  const leftCheckboxChecked = leftCheckboxControlsChecked ? isChecked : isSelected;

  const handleSaveEdit = () => {
    if (!me || !template) return;

    // Ignore blur events that happen immediately after entering edit mode
    if (justEnteredEditMode.current) {
      const timestamp = (performance.now() / 1000).toFixed(3);
      console.log(`[${timestamp}s] [SessionItemRow] Ignoring premature blur`);
      return;
    }

    const timestamp = (performance.now() / 1000).toFixed(3);
    console.log(`[${timestamp}s] [SessionItemRow] Saving edit for:`, item.name);
    const trimmedValue = editValue.trim();

    // Validate non-empty
    if (!trimmedValue) {
      // Cancel edit if empty
      onExitEditMode?.();
      return;
    }

    // Only save if changed
    if (trimmedValue !== item.name) {
      try {
        // @ts-expect-error Jazz TypeScript inference issue with Account root type
        templateService.renameItem(me, template.$jazz.id, item.id, trimmedValue);
      } catch (error) {
        console.error('[SessionItemRow] Failed to rename item:', error);
        // Could show error toast here
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

  // Compute checkbox styles based on state
  const getCheckboxClassName = () => {
    if (leftCheckboxChecked) {
      return leftCheckboxControlsChecked
        ? 'border-green-500 bg-green-500 text-white'
        : 'border-blue-500 bg-blue-500 text-white';
    }
    return leftCheckboxControlsChecked
      ? 'border-divider-tertiary hover:border-green-400'
      : 'border-divider-tertiary hover:border-blue-400';
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't trigger selection if clicking on checkbox or delete button
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    if (onSelectItem) {
      const newValue = isInsertionPointSelected ? null : item.id;
      onSelectItem(newValue);
    }
  };

  // Only show drag feedback when dragging is actually enabled
  const canActuallyDrag = enableDrag && canDragItem;

  return (
    <div
      ref={canActuallyDrag ? setDragRef : undefined}
      data-item-id={item.id}
      {...(canActuallyDrag ? dragAttributes : {})}
      {...(canActuallyDrag ? dragListeners : {})}
      {...(canActuallyDrag ? longPressHandlers : {})}
      className={`flex items-center gap-3 rounded px-1 py-0.5 transition-all duration-200 ${
        isInsertionPointSelected ? 'bg-interactive-active' : 'hover:bg-interactive-hover'
      } ${onSelectItem ? 'cursor-pointer' : ''} ${canActuallyDrag && !isDragging ? 'cursor-grab' : ''} ${isDragging ? 'opacity-50 cursor-grabbing' : ''} ${
        isHolding && canActuallyDrag
          ? 'scale-[1.02] shadow-lg bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-300'
          : ''
      }`}
      {...(onSelectItem && {
        onClick: handleRowClick,
        role: 'button',
        tabIndex: 0,
      })}
    >
      {/* Left checkbox - Controls selected (available) or checked (selected/checked) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isAnyItemBeingEditedOrDragged) {
            return; // Disable during edit/drag
          }
          if (leftCheckboxControlsChecked) {
            onToggleChecked(item.id);
          } else {
            onToggleSelected(item.id);
          }
        }}
        disabled={isAnyItemBeingEditedOrDragged}
        aria-label={
          leftCheckboxControlsChecked
            ? isChecked
              ? `Mark ${item.name} as not checked`
              : `Mark ${item.name} as checked`
            : isSelected
              ? `Remove ${item.name} from list`
              : `Add ${item.name} to list`
        }
        aria-pressed={leftCheckboxChecked}
        className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${getCheckboxClassName()} ${isAnyItemBeingEditedOrDragged ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {leftCheckboxChecked && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-label={leftCheckboxControlsChecked ? 'Checked' : 'Selected'}
            role="img"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Item name and notes */}
      <div className="flex-1 min-w-0" {...doubleTapHandlers}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            className="w-full px-2 py-1 text-neutral-900 dark:text-neutral-100 border-2 border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 focus:outline-none focus:border-blue-500"
          />
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
            {/* Item name and quantity */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-content-primary ${isChecked ? 'line-through opacity-50' : ''}`}
              >
                {item.name}
              </span>
              {item.defaultQuantity && (
                <span className="text-sm text-content-tertiary">({item.defaultQuantity})</span>
              )}
            </div>
            {/* Notes preview - responsive: right on desktop, below on mobile */}
            {(item.notes || state?.notes) && (
              <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-between">
                {/* Session note (italic, flush left) */}
                {zone !== 'available' && state?.notes && (
                  <span className="text-xs text-content-secondary italic truncate max-w-[150px] sm:max-w-[200px]">
                    {state.notes.split('\n')[0]}
                  </span>
                )}
                {/* Spacer when only template note exists */}
                {zone !== 'available' && !state?.notes && item.notes && <span />}
                {/* Template note (normal font, flush right) */}
                {zone !== 'available' && item.notes && (
                  <span className="text-xs text-content-disabled truncate max-w-[150px] sm:max-w-[200px]">
                    {item.notes.split('\n')[0]}
                  </span>
                )}
                {/* Template note (shown in available zone, flush right) */}
                {zone === 'available' && item.notes && (
                  <span className="text-xs text-content-tertiary truncate max-w-[150px] sm:max-w-[200px] ml-auto">
                    {item.notes.split('\n')[0]}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes icon - visible in available zone (template notes) or zones (session notes) */}
      {onEditNote && (showNotesIcon ?? true) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isAnyItemBeingEditedOrDragged) return;
            onEditNote(item.id);
          }}
          disabled={isAnyItemBeingEditedOrDragged}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            (zone === 'available' ? item.notes : state?.notes)
              ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700'
              : 'text-content-disabled hover:bg-interactive-hover hover:text-content-secondary'
          } ${isAnyItemBeingEditedOrDragged ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label={zone === 'available' ? 'Edit template note' : 'Edit session note'}
        >
          <StickyNote className="h-4 w-4" />
        </button>
      )}

      {/* Right button - Trash icon (visible in available zone when showDeleteIcon, or in selected/checked zones) */}
      {((showDeleteIcon && zone === 'available') || zone === 'selected' || zone === 'checked') && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const timestamp = (performance.now() / 1000).toFixed(3);
            console.log(
              `[${timestamp}s] [SessionItemRow] Right button clicked on:`,
              item.name,
              '- isAnyItemBeingEditedOrDragged:',
              isAnyItemBeingEditedOrDragged,
            );
            if (isAnyItemBeingEditedOrDragged) {
              console.log(`[${timestamp}s] [SessionItemRow] BLOCKED - button disabled`);
              return; // Disable during edit/drag
            }
            if (showDeleteIcon && onDeleteItem) {
              onDeleteItem(item.id);
            } else {
              onToggleSelected(item.id);
            }
          }}
          disabled={isAnyItemBeingEditedOrDragged}
          className={`flex h-6 w-6 items-center justify-center rounded border-2 border-divider-tertiary text-content-tertiary transition-colors hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 ${isAnyItemBeingEditedOrDragged ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label={showDeleteIcon ? 'Delete item' : 'Deselect item'}
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
  );
});

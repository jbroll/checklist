import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import type { InstanceOfSchema } from 'jazz-tools';
import { GripVertical } from 'lucide-react';
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
  simplifiedUI?: boolean; // Enable inline editing only in simplified UI
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
  simplifiedUI = false,
}: SessionItemRowProps) {
  const { me } = useAccount<typeof Account>();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Draggable setup - only in available zone when enabled
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
    disabled: !enableDrag,
  });

  // Inline editing handlers with double-tap support for mobile
  const doubleTapHandlers = useDoubleTap({
    onDoubleTap: (e) => {
      // Only enable in simplified UI mode and when template is available
      if (!simplifiedUI || !template) return;

      // Don't trigger if clicking on buttons
      if ((e.target as HTMLElement).closest('button')) return;

      setEditValue(item.name);
      setIsEditing(true);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    },
  });

  console.log(
    '[SessionItemRow]',
    item.name,
    'isInsertionPointSelected:',
    isInsertionPointSelected,
    'hasOnSelectItem:',
    !!onSelectItem,
  );

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

    const trimmedValue = editValue.trim();

    // Validate non-empty
    if (!trimmedValue) {
      // Cancel edit if empty
      setIsEditing(false);
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

    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
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
      ? 'border-neutral-300 hover:border-green-400'
      : 'border-neutral-300 hover:border-blue-400';
  };

  // Only animate items in selected/checked zones (not available)
  const shouldAnimate = zone === 'selected' || zone === 'checked';

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't trigger selection if clicking on checkbox or delete button
    if ((e.target as HTMLElement).closest('button')) {
      console.log('[SessionItemRow] Click ignored (button)');
      return;
    }

    if (onSelectItem) {
      const newValue = isInsertionPointSelected ? null : item.id;
      console.log('[SessionItemRow] Calling onSelectItem with:', newValue);
      onSelectItem(newValue);
    }
  };

  return (
    <motion.div
      layout={shouldAnimate}
      layoutId={shouldAnimate ? item.id : undefined}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={`flex items-center gap-3 rounded px-1 py-0.5 ${
        isInsertionPointSelected ? 'bg-neutral-200' : 'hover:bg-neutral-100'
      } ${onSelectItem ? 'cursor-pointer' : ''} ${isDragging ? 'opacity-50' : ''}`}
      {...(onSelectItem && {
        onClick: handleRowClick,
        role: 'button',
        tabIndex: 0,
      })}
    >
      {/* Drag handle icon - visible indicator */}
      {enableDrag && (
        <div className="text-neutral-400 hover:text-neutral-600 shrink-0">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* Draggable wrapper for entire row content */}
      <div
        ref={enableDrag ? setDragRef : undefined}
        {...(enableDrag ? dragAttributes : {})}
        {...(enableDrag ? dragListeners : {})}
        className={`flex items-center gap-3 flex-1 ${enableDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* Left checkbox - Controls selected (available) or checked (selected/checked) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (leftCheckboxControlsChecked) {
              onToggleChecked(item.id);
            } else {
              onToggleSelected(item.id);
            }
          }}
          className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${getCheckboxClassName()}`}
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

        {/* Item name */}
        <div className="flex-1" {...doubleTapHandlers}>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="w-full px-2 py-1 text-neutral-900 border-2 border-blue-400 rounded bg-blue-50 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className={`text-neutral-900 ${isChecked ? 'line-through opacity-50' : ''}`}>
                {item.name}
              </span>
              {item.defaultQuantity && (
                <span className="text-sm text-neutral-500">({item.defaultQuantity})</span>
              )}
            </div>
          )}
        </div>

        {/* Right button - Trash icon (visible in available zone when showDeleteIcon, or in selected/checked zones) */}
        {((showDeleteIcon && zone === 'available') ||
          zone === 'selected' ||
          zone === 'checked') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (showDeleteIcon && onDeleteItem) {
                onDeleteItem(item.id);
              } else {
                onToggleSelected(item.id);
              }
            }}
            className="flex h-6 w-6 items-center justify-center rounded border-2 border-neutral-300 text-neutral-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600"
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
    </motion.div>
  );
});

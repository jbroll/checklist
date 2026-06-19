import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Archive, Folder, MoreVertical, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialog } from '@/lib/dialog-context';
import { useDoubleTap } from '@/lib/useDoubleTap';
import type { TemplateItem } from '@/schema';
import { IndentedRow } from './IndentedRow';

interface TemplateItemViewProps {
  item: TemplateItem;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean; // Row highlight (grey background)
  isChecked?: boolean; // Checkbox state (for SessionView normal mode)
  expanded?: boolean; // Override expanded state (for viewState-based expansion)
  onSelect?: (itemId: string) => void;
  onRename?: (itemId: string, newName: string) => void;
  onDelete?: (itemId: string) => void;
  onToggleExpand?: (itemId: string) => void;
  showDeleteIcon?: boolean; // Show trash icon inline (for SessionView adding mode)
  enableDrag?: boolean; // Enable drag and drop (default: true)
  enableEdit?: boolean; // Enable double-click to edit (default: true)
  showCheckbox?: boolean; // Show checkbox for selection (SessionView normal mode)
  onCheckboxToggle?: (itemId: string) => void; // Separate handler for checkbox (SessionView selected state)
  onEditNote?: (itemId: string) => void; // Open note editor dialog
}

export function TemplateItemView({
  item,
  level,
  hasChildren: _hasChildren = false,
  isSelected = false,
  isChecked = false,
  expanded,
  onSelect,
  onRename,
  onDelete,
  onToggleExpand,
  showDeleteIcon = false,
  enableDrag = true,
  enableEdit = true,
  showCheckbox = false,
  onCheckboxToggle,
  onEditNote,
}: TemplateItemViewProps) {
  // Note: hasChildren prop is kept for API compatibility but categories always show chevrons
  void _hasChildren;
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showConfirm } = useDialog();

  const isCategory = item.type === 'category';

  // Draggable setup - both items and categories are draggable
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

  // Droppable setup - only categories can accept drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${item.id}`,
    data: { isCategory, path: item.path, item },
    disabled: !isCategory, // Only categories can accept drops
  });

  const handleStartEdit = () => {
    setEditedName(item.name);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  // Double-tap handler for mobile-friendly inline editing
  const doubleTapHandlers = useDoubleTap({
    onDoubleTap: (e) => {
      // Only allow if editing is enabled
      if (!enableEdit) return;

      // Don't trigger if clicking on buttons or checkboxes
      if ((e.target as HTMLElement).closest('button, input[type="checkbox"]')) {
        return;
      }
      handleStartEdit();
    },
  });

  const handleSaveEdit = () => {
    if (editedName.trim() && editedName !== item.name && onRename) {
      onRename(item.id, editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(item.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      const confirmed = await showConfirm({
        title: 'Delete Item',
        message: item.name,
        confirmText: 'Delete',
        variant: 'danger',
      });
      if (confirmed) {
        onDelete(item.id);
      }
    }
  };

  const handleToggle = () => {
    if (isCategory && onToggleExpand) {
      onToggleExpand(item.id);
    }
  };

  const handleCheckboxChange = () => {
    if (!isEditing) {
      // Use separate checkbox handler if provided, otherwise fall back to onSelect
      if (onCheckboxToggle) {
        onCheckboxToggle(item.id);
      } else if (onSelect) {
        onSelect(item.id);
      }
    }
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // Only trigger selection on row click if we have onSelect but NOT showing checkbox
    // (i.e., insertion point selection mode)
    if (onSelect && !showCheckbox) {
      // Don't trigger if clicking on buttons or interactive elements
      if ((e.target as HTMLElement).closest('button, input')) {
        return;
      }
      onSelect(item.id);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: This div is conditionally interactive for drag-and-drop and item selection
    <div
      ref={setDropRef}
      data-item-id={item.id}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (onSelect && !showCheckbox && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleRowClick(e as unknown as React.MouseEvent);
        }
      }}
      role={onSelect && !showCheckbox ? 'button' : undefined}
      tabIndex={onSelect && !showCheckbox ? 0 : undefined}
      className={`transition-all ${isDragging ? 'opacity-50' : ''} ${
        isOver && isCategory
          ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 border-dashed rounded'
          : ''
      } ${onSelect && !showCheckbox ? 'cursor-pointer' : ''}`}
    >
      <IndentedRow
        level={level}
        expanded={isCategory ? (expanded ?? item.expanded ?? true) : false}
        onToggleExpand={isCategory ? handleToggle : () => {}}
        hasChildren={isCategory}
        className="group"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Selection Checkbox - only show for items (not categories) */}
          {showCheckbox && !isCategory && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCheckboxChange();
              }}
              className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors shrink-0 ${
                isChecked
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-divider-tertiary hover:border-blue-400'
              }`}
            >
              {isChecked && (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-label="Selected"
                  role="img"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          )}

          <div
            ref={enableDrag ? setDragRef : undefined}
            {...(enableDrag ? dragAttributes : {})}
            {...(enableDrag ? dragListeners : {})}
            className={`flex-1 min-w-0 ${enableDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
          >
            <div
              className={`flex flex-wrap items-center gap-x-2 rounded px-2 py-1 -mx-2 w-full transition-colors ${
                isSelected ? 'bg-interactive-active' : ''
              }`}
            >
              {/* Icon */}
              {isCategory && <Folder className="h-4 w-4 shrink-0" />}

              {/* Name (Editable) */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 rounded border border-green-500 px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              ) : (
                <span
                  {...doubleTapHandlers}
                  className={`flex-1 min-w-0 truncate text-left ${
                    isCategory ? 'font-semibold text-content-primary' : 'text-content-primary'
                  }`}
                >
                  {item.name}
                </span>
              )}

              {/* Quantity Badge (items only) */}
              {!isCategory && item.defaultQuantity && (
                <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-content-secondary shrink-0">
                  {item.defaultQuantity}
                </span>
              )}
              {/* Note preview - wraps to new line on mobile, inline on desktop */}
              {item.notes && !isEditing && (
                <span className="basis-full sm:basis-auto text-xs text-content-tertiary truncate sm:max-w-[200px]">
                  {item.notes.split('\n')[0]}
                </span>
              )}
            </div>
          </div>

          {/* Notes icon - show in checkbox mode (SessionView normal mode) */}
          {showCheckbox && onEditNote && !isEditing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditNote(item.id);
              }}
              className={`shrink-0 rounded p-1 transition-colors ${
                item.notes
                  ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700'
                  : 'text-content-disabled hover:bg-interactive-hover hover:text-content-secondary'
              }`}
              aria-label="Edit note"
            >
              <StickyNote className="h-4 w-4" />
            </button>
          )}

          {/* Archived indicator */}
          {item.archived && !isEditing && (
            <Archive className="h-4 w-4 shrink-0 text-content-disabled" />
          )}

          {/* Delete Icon (SessionView adding mode) */}
          {showDeleteIcon && !isEditing && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="shrink-0 rounded p-1 text-content-tertiary hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
              aria-label="Delete item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {/* Actions Menu - only show when not in session normal mode (showCheckbox) */}
          {!isEditing && !showDeleteIcon && !showCheckbox && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 rounded p-1 hover:bg-interactive-hover"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4 text-content-secondary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                {!isCategory && onEditNote && (
                  <DropdownMenuItem onClick={() => onEditNote(item.id)}>
                    <StickyNote className="mr-2 h-4 w-4" />
                    Edit Note
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </IndentedRow>
    </div>
  );
}

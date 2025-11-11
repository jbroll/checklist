import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Archive, Folder, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialog } from '@/lib/dialog-context';
import type { TemplateItem } from '@/schemas';
import { IndentedRow } from './IndentedRow';

interface TemplateItemViewProps {
  item: TemplateItem;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean;
  onSelect?: (itemId: string) => void;
  onRename?: (itemId: string, newName: string) => void;
  onDelete?: (itemId: string) => void;
  onToggleExpand?: (itemId: string) => void;
}

export function TemplateItemView({
  item,
  level,
  hasChildren = false,
  isSelected = false,
  onSelect,
  onRename,
  onDelete,
  onToggleExpand,
}: TemplateItemViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(item.name);
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
  };

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
    if (onSelect && !isEditing) {
      onSelect(item.id);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={setDropRef}
      className={`transition-all ${isDragging ? 'opacity-50' : ''} ${
        isOver && isCategory ? 'bg-green-100 border-2 border-green-500 border-dashed rounded' : ''
      }`}
    >
      <IndentedRow
        level={level}
        expanded={isCategory ? item.expanded : false}
        onToggleExpand={isCategory && hasChildren ? handleToggle : () => {}}
        hasChildren={isCategory && hasChildren}
        className="group"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Selection Checkbox */}
          {onSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              onClick={handleCheckboxClick}
              className="h-4 w-4 shrink-0 rounded border-neutral-300 text-green-600 focus:ring-green-500 cursor-pointer"
            />
          )}

          <div
            ref={setDragRef}
            {...dragAttributes}
            {...dragListeners}
            className="cursor-grab active:cursor-grabbing flex-1 min-w-0"
          >
            <div
              className={`flex items-center gap-2 rounded px-2 py-1 -mx-2 w-full transition-colors ${
                isSelected ? 'bg-green-50' : ''
              }`}
            >
              {/* Icon */}
              {isCategory && <Folder className="h-4 w-4 shrink-0" />}

              {/* Name (Editable) */}
              {isEditing ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 rounded border border-green-500 px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              ) : (
                <span
                  className={`flex-1 min-w-0 truncate text-left text-sm ${
                    isCategory ? 'font-semibold text-neutral-900' : 'text-neutral-700'
                  }`}
                >
                  {item.name}
                </span>
              )}

              {/* Quantity Badge (items only) */}
              {!isCategory && item.defaultQuantity && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 shrink-0">
                  {item.defaultQuantity}
                </span>
              )}
            </div>
          </div>

          {/* Archived indicator */}
          {item.archived && !isEditing && <Archive className="h-4 w-4 shrink-0 text-neutral-400" />}

          {/* Actions Menu */}
          {!isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="invisible shrink-0 rounded p-1 hover:bg-neutral-200 group-hover:visible"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4 text-neutral-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
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

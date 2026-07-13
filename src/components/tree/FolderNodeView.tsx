import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Archive, ArchiveX, Folder, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { ListIcon } from '@/components/ui/BrandIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTemplateFolder } from '@/hooks';
import { useDialog } from '@/lib/dialog-context';
import type { FolderRow } from '@/schema/folder';
import { IndentedRow } from './IndentedRow';

interface FolderNodeViewProps {
  folder: FolderRow;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onToggleExpand: () => void;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  onArchive?: () => void;
  autoStartEditing?: boolean;
  onAutoEditStarted?: () => void;
  children?: React.ReactNode;
  hideArchiveAction?: boolean;
}

/**
 * FolderNodeView — slice 1 (folders-only). Renders one row of the folder tree.
 *
 * Drops the pre-port version's item count, duplicate, autocomplete-domain menu, and
 * import/export/share dialogs — all Jazz `FolderNode`/items-shaped features not in the
 * rowboat `Folder` table yet (see `docs/superpowers/d-t4-report.md`). Rename/archive/delete
 * and drag-and-drop reparenting are fully wired to the rowboat graph via `TreeView`'s
 * `useCheckListHierarchy` handlers.
 */
export const FolderNodeView = memo(function FolderNodeView({
  folder,
  level,
  hasChildren = false,
  isSelected = false,
  onSelect,
  onToggleExpand,
  onRename,
  onDelete,
  onArchive,
  autoStartEditing = false,
  onAutoEditStarted,
  children,
  hideArchiveAction = false,
}: FolderNodeViewProps) {
  const isTemplate = isTemplateFolder(folder);
  const isOrganizational = !isTemplate;

  const name = folder.name;
  const expanded = folder.expanded;
  const folderId = folder.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const { showConfirm } = useDialog();

  // Auto-start editing when requested (e.g., right after creation)
  useEffect(() => {
    if (autoStartEditing && !isEditing) {
      setEditedName(name);
      setIsEditing(true);
      onAutoEditStarted?.();
    }
  }, [autoStartEditing, isEditing, name, onAutoEditStarted]);

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: folderId,
    data: { folderId, folder },
    disabled: false,
  });

  // Droppable setup - ONLY organizational folders can accept drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${folderId}`,
    data: { isFolder: isOrganizational, folderId },
    disabled: !isOrganizational,
  });

  const handleStartEdit = () => {
    setEditedName(name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim() && editedName !== name && onRename) {
      onRename(editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(name);
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

  const handleToggleArchived = async () => {
    if (folder.archived) {
      onArchive?.();
      return;
    }
    if (onArchive) {
      const confirmed = await showConfirm({
        title: 'Archive Item',
        message: name,
        confirmText: 'Archive',
        variant: 'danger',
      });
      if (confirmed) onArchive();
    }
  };

  const handleDelete = async () => {
    if (!folder.archived) {
      if (onArchive) {
        const confirmed = await showConfirm({
          title: 'Delete Item',
          message: name,
          confirmText: 'Delete',
          variant: 'danger',
        });
        if (confirmed) onArchive();
      }
      return;
    }
    if (onDelete) {
      const confirmed = await showConfirm({
        title: 'Permanent Delete',
        message: name,
        confirmText: 'Delete Permanently',
        variant: 'danger',
      });
      if (confirmed) onDelete();
    }
  };

  const handleClick = () => {
    if (!isEditing && onSelect) {
      onSelect();
    }
  };

  return (
    <div>
      <div
        ref={setDropRef}
        className={`transition-all ${isDragging ? 'opacity-50' : ''} ${
          isOver && isOrganizational
            ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 border-dashed rounded'
            : ''
        }`}
      >
        <IndentedRow
          level={level}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          hasChildren={hasChildren}
          className="group"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              ref={setDragRef}
              {...dragAttributes}
              {...dragListeners}
              className="cursor-grab active:cursor-grabbing flex-1 min-w-0"
            >
              <button
                type="button"
                onClick={handleClick}
                className={`flex items-center gap-2 rounded px-2 py-1 -mx-2 w-full min-w-0 transition-colors ${
                  isSelected
                    ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-150 dark:hover:bg-green-900/40'
                    : 'hover:bg-interactive-hover'
                }`}
              >
                {isTemplate ? (
                  <ListIcon className="h-4 w-4 shrink-0" size={16} />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-yellow-600" />
                )}

                {isEditing ? (
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSaveEdit}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 rounded border border-green-500 px-2 py-0.5 text-base bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  />
                ) : (
                  <span
                    className={`flex-1 min-w-0 truncate text-left text-base ${isTemplate ? 'font-semibold text-green-700 dark:text-green-400' : 'font-medium text-content-primary'}`}
                  >
                    {name}
                  </span>
                )}
              </button>
            </div>

            {folder.archived && !isEditing && (
              <Archive className="h-4 w-4 shrink-0 text-content-disabled" />
            )}

            {!isEditing && (
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
                  {/* TODO(slice-2): Duplicate/Share/Autocomplete/Import/Export — items and
                      sharing aren't ported to rowboat yet. */}
                  {!hideArchiveAction && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleToggleArchived}>
                        {folder.archived ? (
                          <>
                            <ArchiveX className="mr-2 h-4 w-4" />
                            Restore
                          </>
                        ) : (
                          <>
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
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

      {children}
    </div>
  );
});

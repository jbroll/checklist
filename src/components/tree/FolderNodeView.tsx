import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import {
  Archive,
  ArchiveX,
  Download,
  Folder,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { memo, useState } from 'react';
import { ExportDialog } from '@/components/export/ExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { BubbleListIcon } from '@/components/ui/BubbleListIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialog } from '@/lib/dialog-context';
import type { Account, FolderNode } from '@/schemas';
import * as folderService from '@/services/folderService';
import { IndentedRow } from './IndentedRow';

interface FolderNodeViewProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onToggleExpand: () => void;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onUseTemplate?: () => void;
  onEditTemplate?: () => void;
  children?: React.ReactNode;
  account: InstanceOfSchema<typeof Account>;
}

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
  onUseTemplate: _onUseTemplate,
  onEditTemplate: _onEditTemplate,
  children,
  account,
}: FolderNodeViewProps) {
  const isTemplate = folderService.isTemplateFolder(folder);
  const isOrganizational = folderService.isOrganizationalFolder(folder);

  const name = folder.name;
  const expanded = folder.expanded;
  const folderId = folder.$jazz.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { showConfirm } = useDialog();

  // Draggable setup - all folders are draggable
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
    disabled: !isOrganizational, // Only organizational folders can accept drops
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
      // Unarchive
      if (onArchive) {
        onArchive();
      }
    } else {
      // Archive
      if (onArchive) {
        const confirmed = await showConfirm({
          title: 'Archive Item',
          message: name,
          confirmText: 'Archive',
          variant: 'danger',
        });
        if (confirmed) {
          onArchive();
        }
      }
    }
  };

  const handleDelete = async () => {
    // If not archived, archive first (soft delete)
    if (!folder.archived) {
      if (onArchive) {
        const confirmed = await showConfirm({
          title: 'Delete Item',
          message: name,
          confirmText: 'Delete',
          variant: 'danger',
        });
        if (confirmed) {
          onArchive();
        }
      }
    } else {
      // If already archived, permanent deletion
      if (onDelete) {
        const confirmed = await showConfirm({
          title: 'Permanent Delete',
          message: name,
          confirmText: 'Delete Permanently',
          variant: 'danger',
        });
        if (confirmed) {
          onDelete();
        }
      }
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
            ? 'bg-green-100 border-2 border-green-500 border-dashed rounded'
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
                className={`flex items-center gap-2 rounded px-2 py-1 -mx-2 w-full transition-colors ${
                  isSelected ? 'bg-green-100 hover:bg-green-150' : 'hover:bg-neutral-100'
                }`}
              >
                {/* Icon */}
                {isTemplate ? (
                  <BubbleListIcon className="h-4 w-4 shrink-0" size={16} />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-yellow-600" />
                )}

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
                    className={`flex-1 min-w-0 truncate text-left text-sm ${isTemplate ? 'font-semibold text-purple-900' : 'font-medium text-neutral-900'}`}
                  >
                    {name}
                  </span>
                )}
              </button>
            </div>

            {/* Archived indicator */}
            {folder.archived && !isEditing && (
              <Archive className="h-4 w-4 shrink-0 text-neutral-400" />
            )}

            {/* Actions Menu - for both folders and templates */}
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
                  {isTemplate && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                      </DropdownMenuItem>
                    </>
                  )}
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

      {/* Child Nodes - rendered by parent TreeView */}
      {children}

      {/* Unified Export Dialog - only for templates */}
      {isTemplate && (
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          account={account}
          folder={folder}
        />
      )}

      {/* Unified Import Dialog - only for templates */}
      {isTemplate && (
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          account={account}
          folder={folder}
        />
      )}
    </div>
  );
});

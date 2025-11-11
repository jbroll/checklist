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
import type { Account, DirectoryEntry, Template } from '@/schemas';
import { IndentedRow } from './IndentedRow';

interface FolderNodeViewProps {
  entry: DirectoryEntry;
  template?: InstanceOfSchema<typeof Template>;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onToggleExpand: () => void;
  onRename?: (entryId: string, newName: string) => void;
  onDelete?: (entryId: string) => void;
  onArchive?: (entryId: string) => void;
  onUseTemplate?: () => void;
  onEditTemplate?: () => void;
  children?: React.ReactNode;
  account: InstanceOfSchema<typeof Account>;
}

export const FolderNodeView = memo(function FolderNodeView({
  entry,
  template,
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
  const isTemplateRef = entry.type === 'template-ref';
  const isFolder = entry.type === 'folder';

  const name = entry.name;
  const path = entry.path;
  const expanded = entry.expanded;
  const entryId = entry.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Draggable setup - all entries are draggable
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: entryId,
    data: { entryId, entry },
    disabled: false,
  });

  // Droppable setup - ONLY folders can accept drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${entryId}`,
    data: { isFolder, path, entryId },
    disabled: !isFolder, // Only folders can accept drops
  });

  const handleStartEdit = () => {
    setEditedName(name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim() && editedName !== name && onRename) {
      onRename(entryId, editedName.trim());
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

  const handleToggleArchived = () => {
    if (entry.archived) {
      // Unarchive
      if (onArchive) {
        onArchive(entryId);
      }
    } else {
      // Archive
      if (onArchive && confirm(`Archive "${name}"?`)) {
        onArchive(entryId);
      }
    }
  };

  const handleDelete = () => {
    // If not archived, archive first (soft delete)
    if (!entry.archived) {
      if (onArchive && confirm(`Archive "${name}"?`)) {
        onArchive(entryId);
      }
    } else {
      // If already archived, permanent deletion
      const warningMessage =
        entry.type === 'template-ref'
          ? `⚠️ PERMANENTLY DELETE "${name}"?\n\nThis will remove the list and all its sessions.\n\nThis action CANNOT be undone!`
          : `⚠️ PERMANENTLY DELETE "${name}"?\n\nThis action CANNOT be undone!`;

      if (onDelete && confirm(warningMessage)) {
        onDelete(entryId);
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
          isOver && isFolder ? 'bg-green-100 border-2 border-green-500 border-dashed rounded' : ''
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
                {isTemplateRef ? (
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
                    className={`flex-1 min-w-0 truncate text-left text-sm ${isTemplateRef ? 'font-semibold text-purple-900' : 'font-medium text-neutral-900'}`}
                  >
                    {name}
                  </span>
                )}
              </button>
            </div>

            {/* Actions Menu - for both folders and template-refs */}
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
                  {isTemplateRef && (
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
                    {entry.archived ? (
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

      {/* Unified Export Dialog - only for template-refs */}
      {isTemplateRef && template && (
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          account={account}
          folder={template}
        />
      )}

      {/* Unified Import Dialog - only for template-refs */}
      {isTemplateRef && template && (
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          account={account}
          folder={template}
        />
      )}
    </div>
  );
});

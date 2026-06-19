import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import {
  Archive,
  ArchiveX,
  Copy,
  Download,
  Folder,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { lazy, memo, Suspense, useEffect, useState } from 'react';

// Lazy load dialogs
const ExportDialog = lazy(() =>
  import('@/components/export/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
const ImportDialog = lazy(() =>
  import('@/components/import/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);
const ShareDialog = lazy(() =>
  import('@/components/sharing/ShareDialog').then((m) => ({ default: m.ShareDialog })),
);

import { ListIcon } from '@/components/ui/BrandIcon';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isOrganizationalFolder, isTemplateFolder, useCheckListHierarchy } from '@/hooks';
import { getDomainDisplayName, getImplementedDomains } from '@/lib/categorization';
import { useDialog } from '@/lib/dialog-context';
import type { Account, FolderNode, TemplateItem } from '@/schema';
import * as userSettingsService from '@/services/userSettingsService';
import * as viewStateService from '@/services/viewStateService';
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
  onDuplicated?: (newFolder: InstanceOfSchema<typeof FolderNode>) => void;
  autoStartEditing?: boolean;
  onAutoEditStarted?: () => void;
  children?: React.ReactNode;
  account: InstanceOfSchema<typeof Account>;
  hideArchiveAction?: boolean;
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
  onDuplicated,
  autoStartEditing = false,
  onAutoEditStarted,
  children,
  account,
  hideArchiveAction = false,
}: FolderNodeViewProps) {
  // Use hierarchy hook for folder operations
  const { duplicateTemplate } = useCheckListHierarchy(account);

  const isTemplate = isTemplateFolder(folder);
  const isOrganizational = isOrganizationalFolder(folder);
  const itemCount = isTemplate
    ? (folder.items?.filter((i: TemplateItem) => !i?.archived).length ?? 0)
    : 0;

  const name = folder.name;
  const expanded = viewStateService.getFolderExpanded(account, folder.$jazz.id);
  const folderId = folder.$jazz.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const { showConfirm } = useDialog();

  // Auto-start editing when requested (e.g., after duplication)
  useEffect(() => {
    if (autoStartEditing && !isEditing) {
      setEditedName(name);
      setIsEditing(true);
      onAutoEditStarted?.();
    }
  }, [autoStartEditing, isEditing, name, onAutoEditStarted]);

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

  const handleDuplicate = () => {
    if (isTemplate) {
      const newFolder = duplicateTemplate(folder);
      if (newFolder) {
        onDuplicated?.(newFolder);
      }
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
                {/* Icon */}
                {isTemplate ? (
                  <ListIcon className="h-4 w-4 shrink-0" size={16} />
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
                    className="flex-1 min-w-0 rounded border border-green-500 px-2 py-0.5 text-base bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  />
                ) : (
                  <>
                    <span
                      className={`flex-1 min-w-0 truncate text-left text-base ${isTemplate ? 'font-semibold text-green-700 dark:text-green-400' : 'font-medium text-content-primary'}`}
                    >
                      {name}
                    </span>
                    {itemCount > 0 && (
                      <span className="shrink-0 rounded-full bg-surface-tertiary px-2.5 py-0.5 text-sm font-medium text-content-secondary">
                        {itemCount}
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* Archived indicator */}
            {folder.archived && !isEditing && (
              <Archive className="h-4 w-4 shrink-0 text-content-disabled" />
            )}

            {/* Actions Menu - for both folders and templates */}
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
                  {isTemplate && (
                    <DropdownMenuItem onClick={handleDuplicate}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowShareDialog(true)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  {isTemplate && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Autocomplete</DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup
                              value={userSettingsService.getTemplateAutocompleteDomain(folder)}
                              onValueChange={(value) =>
                                userSettingsService.setTemplateAutocompleteDomain(
                                  folder,
                                  value as 'none' | 'grocery' | 'hardware' | 'all',
                                )
                              }
                            >
                              <DropdownMenuRadioItem value="none">Off</DropdownMenuRadioItem>
                              {getImplementedDomains().map((domainId) => (
                                <DropdownMenuRadioItem key={domainId} value={domainId}>
                                  {getDomainDisplayName(domainId)}
                                </DropdownMenuRadioItem>
                              ))}
                              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      <DropdownMenuCheckboxItem
                        checked={userSettingsService.getTemplateAutoCategorizeEnabled(
                          account,
                          folder,
                        )}
                        onCheckedChange={() =>
                          userSettingsService.toggleTemplateAutoCategorize(account, folder)
                        }
                      >
                        Auto-categorize
                      </DropdownMenuCheckboxItem>
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

      {/* Child Nodes - rendered by parent TreeView */}
      {children}

      {/* Unified Export Dialog - only for templates */}
      {isTemplate && (
        <Suspense fallback={null}>
          <ExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            account={account}
            folder={folder}
          />
        </Suspense>
      )}

      {/* Unified Import Dialog - only for templates */}
      {isTemplate && (
        <Suspense fallback={null}>
          <ImportDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            account={account}
            folder={folder}
          />
        </Suspense>
      )}

      {/* Share Dialog - for all folders */}
      <Suspense fallback={null}>
        <ShareDialog open={showShareDialog} onOpenChange={setShowShareDialog} folder={folder} />
      </Suspense>
    </div>
  );
});

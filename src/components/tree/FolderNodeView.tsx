import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Download, Folder, MoreVertical, Pencil, Trash2, Upload } from 'lucide-react';
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
import type { Account, Template } from '@/schemas';
import type { DerivedFolder } from '@/services/templateService';
import { IndentedRow } from './IndentedRow';

interface FolderNodeViewProps {
  folder?: DerivedFolder;
  template?: InstanceOfSchema<typeof Template>;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean;
  onSelect?: (templateId: string) => void;
  onToggleExpand: () => void;
  onRename?: (templateId: string, newName: string) => void;
  onDelete?: (templateId: string) => void;
  onUseTemplate?: (templateId: string) => void;
  onEditTemplate?: (templateId: string) => void;
  children?: React.ReactNode;
  account: InstanceOfSchema<typeof Account>;
}

export const FolderNodeView = memo(function FolderNodeView({
  folder,
  template,
  level,
  hasChildren = false,
  isSelected = false,
  onSelect,
  onToggleExpand,
  onRename,
  onDelete,
  onUseTemplate: _onUseTemplate,
  onEditTemplate: _onEditTemplate,
  children,
  account,
}: FolderNodeViewProps) {
  const isTemplate = !!template;
  const isFolderNode = !!folder;

  const name = template?.name || folder?.name || '';
  const path = template?.path || folder?.path || '';
  const expanded = template ? true : folder?.expanded ?? true; // Templates don't have expanded state
  const id = template?.$jazz.id || folder?.path || '';

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Draggable setup - only templates are draggable
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: id,
    data: { template },
    disabled: !isTemplate, // Only templates can be dragged
  });

  // Droppable setup - ONLY folders can accept drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${id}`,
    data: { isFolder: isFolderNode, path, folder },
    disabled: isTemplate, // Templates cannot accept drops
  });

  const handleStartEdit = () => {
    setEditedName(name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim() && editedName !== name && onRename && template) {
      onRename(template.$jazz.id, editedName.trim());
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

  const handleDelete = () => {
    if (onDelete && template && confirm(`Delete "${name}"?`)) {
      onDelete(template.$jazz.id);
    }
  };

  const handleClick = () => {
    if (!isEditing && onSelect && template) {
      onSelect(template.$jazz.id);
    }
  };

  return (
    <div>
      <div
        ref={setDropRef}
        className={`transition-all ${isDragging ? 'opacity-50' : ''} ${
          isOver && !isTemplate
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
              className={isTemplate ? "cursor-grab active:cursor-grabbing flex-1 min-w-0" : "flex-1 min-w-0"}
            >
              <button
                type="button"
                onClick={handleClick}
                className={`flex items-center gap-2 rounded px-2 py-1 -mx-2 w-full transition-colors ${
                  isSelected ? 'bg-green-100 hover:bg-green-150' : 'hover:bg-neutral-100'
                }`}
              >
                {/* Folder Icon */}
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

            {/* Actions Menu - only for templates */}
            {!isEditing && isTemplate && (
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
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
      {isTemplate && template && (
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          account={account}
          folder={template}
        />
      )}

      {/* Unified Import Dialog - only for templates */}
      {isTemplate && template && (
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

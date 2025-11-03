import type { InstanceOfSchema } from 'jazz-tools';
import { Download, FileText, Folder, MoreVertical, Pencil, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/ExportDialog';
import { TemplateItemsExportDialog } from '@/components/export/TemplateItemsExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { TemplateItemsImportDialog } from '@/components/import/TemplateItemsImportDialog';
import { BubbleListIcon } from '@/components/ui/BubbleListIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FolderNode as FolderNodeType, GroceriesAccount } from '@/schemas';
import { TreeNode } from './TreeNode';

interface FolderNodeViewProps {
  node: InstanceOfSchema<typeof FolderNodeType>;
  level: number;
  hasChildren?: boolean;
  isSelected?: boolean;
  onSelect?: (nodeId: string) => void;
  onToggleExpand: () => void;
  onRename?: (nodeId: string, newName: string) => void;
  onDelete?: (nodeId: string) => void;
  onUseTemplate?: (nodeId: string) => void;
  onEditTemplate?: (nodeId: string) => void;
  children?: React.ReactNode;
  account: InstanceOfSchema<typeof GroceriesAccount>;
}

export function FolderNodeView({
  node,
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(node.name);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showTemplateExportDialog, setShowTemplateExportDialog] = useState(false);
  const [showTemplateImportDialog, setShowTemplateImportDialog] = useState(false);

  const isTemplate = node.type === 'template-folder';

  const handleStartEdit = () => {
    setEditedName(node.name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim() && editedName !== node.name && onRename) {
      onRename(node.$jazz.id, editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(node.name);
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
    if (onDelete && confirm(`Delete "${node.name}"?`)) {
      onDelete(node.$jazz.id);
    }
  };

  const handleClick = () => {
    if (!isEditing && onSelect) {
      onSelect(node.$jazz.id);
    }
  };

  return (
    <div>
      <TreeNode
        level={level}
        expanded={node.expanded}
        onToggleExpand={onToggleExpand}
        hasChildren={hasChildren}
        className="group"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={handleClick}
            className={`flex items-center gap-2 rounded px-2 py-1 -mx-2 flex-1 min-w-0 transition-colors ${
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
                {node.name}
              </span>
            )}
          </button>

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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export folder (JSON)
                </DropdownMenuItem>
                {isTemplate && (
                  <DropdownMenuItem onClick={() => setShowTemplateExportDialog(true)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Export items list (TXT/CSV)
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import folder (JSON)
                </DropdownMenuItem>
                {isTemplate && (
                  <DropdownMenuItem onClick={() => setShowTemplateImportDialog(true)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Import items list (TXT/CSV)
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TreeNode>

      {/* Child Nodes - rendered by parent TreeView */}
      {children}

      {/* Full Folder Export Dialog (JSON) */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        account={account}
        selectedFolderId={node.$jazz.id}
      />

      {/* Full Folder Import Dialog (JSON) */}
      <ImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} account={account} />

      {/* Template Items Export Dialog (TXT/CSV) */}
      {isTemplate && (
        <TemplateItemsExportDialog
          open={showTemplateExportDialog}
          onOpenChange={setShowTemplateExportDialog}
          folder={node}
          account={account}
        />
      )}

      {/* Template Items Import Dialog (TXT/CSV) */}
      {isTemplate && (
        <TemplateItemsImportDialog
          open={showTemplateImportDialog}
          onOpenChange={setShowTemplateImportDialog}
          folder={node}
          account={account}
        />
      )}
    </div>
  );
}

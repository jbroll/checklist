import type { InstanceOfSchema } from 'jazz-tools';
import {
  Download,
  FileText,
  Folder,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/ExportDialog';
import { TemplateItemsExportDialog } from '@/components/export/TemplateItemsExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { TemplateItemsImportDialog } from '@/components/import/TemplateItemsImportDialog';
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
  onToggleExpand: () => void;
  onRename?: (nodeId: string, newName: string) => void;
  onDelete?: (nodeId: string) => void;
  children?: React.ReactNode;
  account: InstanceOfSchema<typeof GroceriesAccount>;
}

export function FolderNodeView({
  node,
  level,
  onToggleExpand,
  onRename,
  onDelete,
  children,
  account,
}: FolderNodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(node.name);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showTemplateExportDialog, setShowTemplateExportDialog] = useState(false);
  const [showTemplateImportDialog, setShowTemplateImportDialog] = useState(false);

  const hasChildren = (node.items?.length ?? 0) > 0;
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

  return (
    <div>
      <TreeNode
        level={level}
        expanded={node.expanded}
        onToggleExpand={onToggleExpand}
        hasChildren={hasChildren}
        className="group"
      >
        <div className="flex flex-1 items-center gap-2">
          {/* Folder Icon */}
          {node.expanded ? (
            <FolderOpen
              className={`h-4 w-4 ${isTemplate ? 'text-purple-600' : 'text-yellow-600'}`}
            />
          ) : (
            <Folder className={`h-4 w-4 ${isTemplate ? 'text-purple-600' : 'text-yellow-600'}`} />
          )}

          {/* Name (Editable) */}
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="flex-1 rounded border border-green-500 px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          ) : (
            <span
              className={`flex-1 text-sm ${isTemplate ? 'font-semibold text-purple-900' : 'font-medium text-neutral-900'}`}
            >
              {node.name}
              {isTemplate && (
                <span className="ml-2 text-xs font-normal text-purple-600">(Template)</span>
              )}
            </span>
          )}

          {/* Actions Menu */}
          {!isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="invisible rounded p-1 hover:bg-neutral-200 group-hover:visible"
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

      {/* Child Nodes */}
      {node.expanded && children}

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

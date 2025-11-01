import { Folder, FolderOpen, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FolderNode as FolderNodeType } from '@/schemas';
import { TreeNode } from './TreeNode';

interface FolderNodeViewProps {
  node: typeof FolderNodeType;
  level: number;
  onToggleExpand: () => void;
  onRename?: (nodeId: string, newName: string) => void;
  onDelete?: (nodeId: string) => void;
  children?: React.ReactNode;
}

export function FolderNodeView({
  node,
  level,
  onToggleExpand,
  onRename,
  onDelete,
  children,
}: FolderNodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(node.name);

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
    </div>
  );
}

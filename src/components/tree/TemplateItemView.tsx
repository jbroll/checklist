import type { InstanceOfSchema } from 'jazz-tools';
import { ChevronDown, ChevronRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TemplateItem as TemplateItemType } from '@/schemas';
import { TreeNode } from './TreeNode';

interface TemplateItemViewProps {
  item: InstanceOfSchema<typeof TemplateItemType>;
  level: number;
  hasChildren?: boolean;
  onRename?: (itemId: string, newName: string) => void;
  onDelete?: (itemId: string) => void;
  onToggleExpand?: (itemId: string) => void;
}

export function TemplateItemView({
  item,
  level,
  hasChildren = false,
  onRename,
  onDelete,
  onToggleExpand,
}: TemplateItemViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(item.name);

  const isCategory = item.type === 'category';

  const handleStartEdit = () => {
    setEditedName(item.name);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim() && editedName !== item.name && onRename) {
      onRename(item.$jazz.id, editedName.trim());
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

  const handleDelete = () => {
    if (onDelete && confirm(`Delete "${item.name}"?`)) {
      onDelete(item.$jazz.id);
    }
  };

  const handleToggle = () => {
    if (isCategory && onToggleExpand) {
      onToggleExpand(item.$jazz.id);
    }
  };

  return (
    <TreeNode
      level={level}
      expanded={isCategory ? item.expanded : false}
      onToggleExpand={isCategory && hasChildren ? handleToggle : () => {}}
      hasChildren={isCategory && hasChildren}
      className="group"
    >
      <div className="flex flex-1 items-center gap-2">
        {/* Expand/Collapse Icon for categories with children */}
        {isCategory && hasChildren ? (
          <button
            type="button"
            onClick={handleToggle}
            className="shrink-0 rounded p-0.5 hover:bg-neutral-200"
          >
            {item.expanded ? (
              <ChevronDown className="h-4 w-4 text-neutral-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-600" />
            )}
          </button>
        ) : (
          <div className="w-5" /> // Spacer for alignment
        )}

        {/* Icon */}
        <span className="text-sm shrink-0">{item.icon || (isCategory ? '📁' : '📦')}</span>

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
            className={`flex-1 text-sm ${isCategory ? 'font-semibold text-neutral-900' : 'text-neutral-700'}`}
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

        {/* Actions Menu */}
        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="invisible rounded p-1 hover:bg-neutral-200 group-hover:visible shrink-0"
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
  );
}

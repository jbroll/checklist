import type { InstanceOfSchema } from 'jazz-tools';
import { MoreVertical, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CATEGORIES, type TemplateItem as TemplateItemType } from '@/schemas';
import { TreeNode } from './TreeNode';

interface TemplateItemViewProps {
  item: InstanceOfSchema<typeof TemplateItemType>;
  level: number;
  onRename?: (itemId: string, newName: string) => void;
  onDelete?: (itemId: string) => void;
  onAddToSession?: (itemId: string) => void;
}

export function TemplateItemView({
  item,
  level,
  onRename,
  onDelete,
  onAddToSession,
}: TemplateItemViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(item.name);

  const categoryInfo = CATEGORIES[item.category];

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

  const handleAddToSession = () => {
    if (onAddToSession) {
      onAddToSession(item.$jazz.id);
    }
  };

  return (
    <TreeNode
      level={level}
      expanded={false}
      onToggleExpand={() => {}}
      hasChildren={false}
      className="group"
    >
      <div className="flex flex-1 items-center gap-2">
        {/* Category Icon */}
        <span className="text-sm">{categoryInfo.icon}</span>

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
          <span className="flex-1 text-sm text-neutral-700">{item.name}</span>
        )}

        {/* Quantity Badge */}
        {item.defaultQuantity && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
            {item.defaultQuantity}
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
              <DropdownMenuItem onClick={handleAddToSession}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Add to Shopping Session
              </DropdownMenuItem>
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

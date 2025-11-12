import { Folder, Trash2 } from 'lucide-react';
import type { TemplateItem } from '@/schemas';

interface SimplifiedSessionItemRowProps {
  item: TemplateItem;
  checked: boolean;
  showTrash: boolean;
  onCheckToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  level?: number;
}

/**
 * SimplifiedSessionItemRow - Row component for simplified session view
 * Displays item/category with checkbox and optional trash icon
 */
export function SimplifiedSessionItemRow({
  item,
  checked,
  showTrash,
  onCheckToggle,
  onDelete,
  level = 0,
}: SimplifiedSessionItemRowProps) {
  const isCategory = item.type === 'category';

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 hover:bg-neutral-50 transition-colors group"
      style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onCheckToggle(item.id)}
        className="w-5 h-5 rounded border-neutral-300 text-green-600 focus:ring-green-500 cursor-pointer"
      />

      {/* Category icon */}
      {isCategory && <Folder className="h-4 w-4 text-neutral-400 shrink-0" />}

      {/* Item name */}
      <span
        className={`flex-1 ${checked ? 'line-through text-neutral-400' : 'text-neutral-900'} ${
          isCategory ? 'font-medium' : ''
        }`}
      >
        {item.name}
      </span>

      {/* Trash icon */}
      {showTrash && (
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </button>
      )}
    </div>
  );
}

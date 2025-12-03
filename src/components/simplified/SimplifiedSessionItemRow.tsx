import { ArrowDown, Folder, Trash2 } from 'lucide-react';
import type { TemplateItem } from '@/schemas';

interface SimplifiedSessionItemRowProps {
  item: TemplateItem;
  checked: boolean;
  showTrash: boolean;
  isSelected?: boolean;
  onCheckToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onSelect?: (itemId: string | null) => void;
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
  isSelected = false,
  onCheckToggle,
  onDelete,
  onSelect,
  level = 0,
}: SimplifiedSessionItemRowProps) {
  const isCategory = item.type === 'category';

  // Debug logging
  console.log('[SimplifiedSessionItemRow]', {
    itemName: item.name,
    itemId: item.id,
    isSelected,
    hasOnSelect: !!onSelect,
  });

  const handleRowClick = (e: React.MouseEvent) => {
    console.log('[SimplifiedSessionItemRow] Row clicked:', {
      itemName: item.name,
      itemId: item.id,
      hasOnSelect: !!onSelect,
    });

    // Don't trigger selection if clicking on checkbox or trash button
    if (
      (e.target as HTMLElement).closest('input[type="checkbox"]') ||
      (e.target as HTMLElement).closest('button')
    ) {
      console.log('[SimplifiedSessionItemRow] Click ignored (checkbox or button)');
      return;
    }

    if (onSelect) {
      const newValue = isSelected ? null : item.id;
      console.log('[SimplifiedSessionItemRow] Calling onSelect with:', newValue);
      // Toggle selection: if already selected, deselect; otherwise select
      onSelect(newValue);
    } else {
      console.log('[SimplifiedSessionItemRow] onSelect is not defined');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Enter and Space keys for accessibility
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSelect) {
        onSelect(isSelected ? null : item.id);
      }
    }
  };

  return (
    <div
      className={`flex items-center gap-3 py-2 px-3 transition-all group ${
        isSelected
          ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500 ring-inset'
          : onSelect
            ? 'hover:bg-interactive-hover'
            : ''
      } ${onSelect ? 'cursor-pointer' : ''}`}
      style={{
        paddingLeft: `${level * 1.5 + 0.75}rem`,
      }}
      {...(onSelect && {
        onClick: handleRowClick,
        onKeyDown: handleKeyDown,
        role: 'button',
        tabIndex: 0,
      })}
    >
      {/* Selection indicator - shown when row is selected */}
      {isSelected && (
        <div className="shrink-0">
          <ArrowDown className="h-4 w-4 text-green-600 font-bold" />
        </div>
      )}

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onCheckToggle(item.id)}
        className="w-5 h-5 rounded border-divider-tertiary text-green-600 focus:ring-green-500 cursor-pointer"
      />

      {/* Category icon */}
      {isCategory && <Folder className="h-4 w-4 text-content-disabled shrink-0" />}

      {/* Item name */}
      <span
        className={`flex-1 ${checked ? 'line-through text-content-disabled' : 'text-content-primary'} ${
          isCategory ? 'font-medium' : ''
        } ${isSelected ? 'font-semibold text-green-700 dark:text-green-400' : ''}`}
      >
        {item.name}
      </span>

      {/* Trash icon */}
      {showTrash && (
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </button>
      )}
    </div>
  );
}

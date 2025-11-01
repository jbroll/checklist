import { Trash2 } from 'lucide-react';
import { CATEGORIES, type GroceryItem } from '@/schemas';

interface ItemRowProps {
  item: typeof GroceryItem;
  onToggleCheck: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

export function ItemRow({ item, onToggleCheck, onDelete }: ItemRowProps) {
  const categoryInfo = CATEGORIES[item.category as keyof typeof CATEGORIES];

  const handleDelete = () => {
    if (window.confirm(`Delete "${item.name}"?`)) {
      onDelete(item.$jazz.id);
    }
  };

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border bg-white p-3 transition-all ${
        item.checked ? 'border-neutral-200 bg-neutral-50' : 'border-neutral-200 hover:shadow-sm'
      }`}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggleCheck(item.$jazz.id)}
        className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-all ${
          item.checked
            ? 'border-green-600 bg-green-600'
            : 'border-neutral-300 hover:border-green-500'
        }`}
        aria-label={item.checked ? 'Uncheck item' : 'Check item'}
      >
        {item.checked && (
          <svg
            className="h-full w-full text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            role="img"
            aria-label="Checked"
          >
            <title>Checked</title>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Category Icon */}
      <div
        className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-lg"
        style={{
          backgroundColor: `${categoryInfo.color}20`,
          color: categoryInfo.color,
        }}
      >
        {categoryInfo.icon}
      </div>

      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <div
          className={`font-medium ${
            item.checked ? 'text-neutral-500 line-through' : 'text-neutral-900'
          }`}
        >
          {item.name}
        </div>
        {item.quantity && <div className="text-sm text-neutral-500">{item.quantity}</div>}
        {item.notes && <div className="text-sm text-neutral-500 truncate">{item.notes}</div>}
      </div>

      {/* Delete Button */}
      <button
        type="button"
        onClick={handleDelete}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-opacity"
        aria-label="Delete item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

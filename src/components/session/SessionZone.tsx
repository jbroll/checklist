import type { InstanceOfSchema } from 'jazz-tools';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ItemState, TemplateItem } from '@/schemas/tree';
import { ShoppingSessionItemRow } from './ShoppingSessionItemRow';

interface SessionZoneProps {
  title: string;
  icon: string;
  zone: 'inventory' | 'cart' | 'completed';
  items: InstanceOfSchema<typeof TemplateItem>[];
  itemStates: Record<string, InstanceOfSchema<typeof ItemState>>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleCart: (itemId: string) => void;
  onTogglePurchased: (itemId: string) => void;
  count?: number;
}

export function SessionZone({
  title,
  icon,
  zone,
  items,
  itemStates,
  expanded,
  onToggleExpand,
  onToggleCart,
  onTogglePurchased,
  count,
}: SessionZoneProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      {/* Zone header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-2 p-4 text-left hover:bg-neutral-50"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-neutral-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-neutral-500" />
        )}
        <span className="text-xl">{icon}</span>
        <span className="flex-1 text-lg font-semibold text-neutral-900">{title}</span>
        {count !== undefined && (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
            {count}
          </span>
        )}
      </button>

      {/* Zone items */}
      {expanded && (
        <div className="border-t border-neutral-200 p-4">
          {items.length === 0 ? (
            <div className="py-8 text-center text-neutral-500">
              <p>No items in this zone</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <ShoppingSessionItemRow
                  key={item.$jazz.id}
                  item={item}
                  state={itemStates[item.$jazz.id] || null}
                  zone={zone}
                  onToggleCart={onToggleCart}
                  onTogglePurchased={onTogglePurchased}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import type { InstanceOfSchema } from 'jazz-tools';
import { useAccount } from '@/lib/jazz';
import type { GroceriesAccount } from '@/schemas';
import type { ItemState, TemplateItem } from '@/schemas/tree';

interface ShoppingSessionItemRowProps {
  item: InstanceOfSchema<typeof TemplateItem>;
  state: InstanceOfSchema<typeof ItemState> | null;
  zone: 'inventory' | 'cart' | 'completed';
  onToggleCart: (itemId: string) => void;
  onTogglePurchased: (itemId: string) => void;
}

export function ShoppingSessionItemRow({
  item,
  state,
  zone,
  onToggleCart,
  onTogglePurchased,
}: ShoppingSessionItemRowProps) {
  const { me } = useAccount<typeof GroceriesAccount>();

  if (!me) return null;

  // Only leaf items should be shown in shopping sessions
  if (item.type === 'category') return null;

  const inCart = state?.inCart || false;
  const purchased = state?.purchased || false;

  return (
    <div className="flex items-center gap-3 rounded px-2 py-1 hover:bg-neutral-100">
      {/* Left checkbox - Add to cart */}
      <button
        type="button"
        onClick={() => onToggleCart(item.$jazz.id)}
        className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
          inCart
            ? 'border-blue-500 bg-blue-500 text-white'
            : 'border-neutral-300 hover:border-blue-400'
        }`}
      >
        {inCart && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-label="Checked"
            role="img"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Item name with icon */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base">{item.icon || '📦'}</span>
          <span className={`text-neutral-900 ${purchased ? 'line-through opacity-50' : ''}`}>
            {item.name}
          </span>
          {item.defaultQuantity && (
            <span className="text-sm text-neutral-500">({item.defaultQuantity})</span>
          )}
        </div>
      </div>

      {/* Right checkbox - Purchased (visible in cart and completed zones) */}
      {(zone === 'cart' || zone === 'completed') && (
        <button
          type="button"
          onClick={() => onTogglePurchased(item.$jazz.id)}
          className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
            purchased
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-neutral-300 hover:border-green-400'
          }`}
        >
          {purchased && (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-label="Purchased"
              role="img"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

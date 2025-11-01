import { useAccount } from '@/lib/jazz';
import type { GroceriesAccount } from '@/schemas';
import { CATEGORIES } from '@/schemas';
import type { ItemState, TemplateItem } from '@/schemas/tree';

interface ShoppingSessionItemRowProps {
  item: typeof TemplateItem;
  state: typeof ItemState | null;
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

  const categoryInfo = CATEGORIES[item.category];
  const inCart = state?.inCart || false;
  const purchased = state?.purchased || false;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 hover:bg-neutral-50">
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

      {/* Item name with category icon */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{categoryInfo.icon}</span>
          <span className={`text-neutral-900 ${purchased ? 'line-through opacity-50' : ''}`}>
            {item.name}
          </span>
        </div>
      </div>

      {/* Right checkbox - Purchased (only visible in cart zone) */}
      {zone === 'cart' && (
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

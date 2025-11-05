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

  // Determine which state the left checkbox controls based on zone
  const leftCheckboxControlsPurchased = zone === 'cart' || zone === 'completed';
  const leftCheckboxChecked = leftCheckboxControlsPurchased ? purchased : inCart;

  return (
    <div className="flex items-center gap-3 rounded px-2 py-1 hover:bg-neutral-100">
      {/* Left checkbox - Controls inCart (inventory) or purchased (cart/completed) */}
      <button
        type="button"
        onClick={() => {
          if (leftCheckboxControlsPurchased) {
            onTogglePurchased(item.$jazz.id);
          } else {
            onToggleCart(item.$jazz.id);
          }
        }}
        className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
          leftCheckboxChecked
            ? leftCheckboxControlsPurchased
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-blue-500 bg-blue-500 text-white'
            : leftCheckboxControlsPurchased
              ? 'border-neutral-300 hover:border-green-400'
              : 'border-neutral-300 hover:border-blue-400'
        }`}
      >
        {leftCheckboxChecked && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-label={leftCheckboxControlsPurchased ? 'Purchased' : 'In Cart'}
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

      {/* Right button - Trash icon to remove from cart (visible in cart and completed zones) */}
      {(zone === 'cart' || zone === 'completed') && (
        <button
          type="button"
          onClick={() => onToggleCart(item.$jazz.id)}
          className="flex h-6 w-6 items-center justify-center rounded border-2 border-neutral-300 text-neutral-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Remove from cart"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

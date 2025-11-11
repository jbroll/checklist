import { motion } from 'framer-motion';
import { memo } from 'react';
import { useAccount } from '@/lib/jazz';
import type { Account, ItemState, TemplateItem } from '@/schemas';

interface SessionItemRowProps {
  item: TemplateItem;
  state: ItemState | null;
  zone: 'available' | 'selected' | 'checked';
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
}

export const SessionItemRow = memo(function SessionItemRow({
  item,
  state,
  zone,
  onToggleSelected,
  onToggleChecked,
}: SessionItemRowProps) {
  const { me } = useAccount<typeof Account>();

  if (!me) return null;

  // Only leaf items should be shown in shopping sessions
  if (item.type === 'category') return null;

  const isSelected = state?.selected || false;
  const isChecked = state?.checked || false;

  // Determine which state the left checkbox controls based on zone
  const leftCheckboxControlsChecked = zone === 'selected' || zone === 'checked';
  const leftCheckboxChecked = leftCheckboxControlsChecked ? isChecked : isSelected;

  // Compute checkbox styles based on state
  const getCheckboxClassName = () => {
    if (leftCheckboxChecked) {
      return leftCheckboxControlsChecked
        ? 'border-green-500 bg-green-500 text-white'
        : 'border-blue-500 bg-blue-500 text-white';
    }
    return leftCheckboxControlsChecked
      ? 'border-neutral-300 hover:border-green-400'
      : 'border-neutral-300 hover:border-blue-400';
  };

  // Only animate items in selected/checked zones (not available)
  const shouldAnimate = zone === 'selected' || zone === 'checked';

  return (
    <motion.div
      layout={shouldAnimate}
      layoutId={shouldAnimate ? item.id : undefined}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex items-center gap-3 rounded px-1 py-0.5 hover:bg-neutral-100"
    >
      {/* Left checkbox - Controls selected (available) or checked (selected/checked) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (leftCheckboxControlsChecked) {
            onToggleChecked(item.id);
          } else {
            onToggleSelected(item.id);
          }
        }}
        className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${getCheckboxClassName()}`}
      >
        {leftCheckboxChecked && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-label={leftCheckboxControlsChecked ? 'Checked' : 'Selected'}
            role="img"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Item name */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-neutral-900 ${isChecked ? 'line-through opacity-50' : ''}`}>
            {item.name}
          </span>
          {item.defaultQuantity && (
            <span className="text-sm text-neutral-500">({item.defaultQuantity})</span>
          )}
        </div>
      </div>

      {/* Right button - Trash icon to deselect (visible in selected and checked zones) */}
      {(zone === 'selected' || zone === 'checked') && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelected(item.id);
          }}
          className="flex h-6 w-6 items-center justify-center rounded border-2 border-neutral-300 text-neutral-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Deselect item"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            role="img"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </motion.div>
  );
});

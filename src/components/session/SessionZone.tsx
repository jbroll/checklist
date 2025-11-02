import { AnimatePresence, motion } from 'framer-motion';
import type { InstanceOfSchema } from 'jazz-tools';
import { ChevronRight } from 'lucide-react';
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
  children?: React.ReactNode;
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
  children,
}: SessionZoneProps) {
  return (
    <div>
      {/* Zone header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-2 p-4 text-left hover:bg-neutral-50"
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        >
          <ChevronRight className="h-5 w-5 text-neutral-500" />
        </motion.div>
        <span className="text-xl">{icon}</span>
        <span className="flex-1 text-lg font-semibold text-neutral-900">{title}</span>
        {count !== undefined && (
          <motion.span
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700"
          >
            {count}
          </motion.span>
        )}
      </button>

      {/* Zone items with expand/collapse animation */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] },
              opacity: { duration: 0.3, ease: 'easeInOut' },
            }}
            className="overflow-hidden"
          >
            <div className="pl-8">
              {children ? (
                children
              ) : items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="py-8 text-center text-neutral-500"
                >
                  <p>No items in this zone</p>
                </motion.div>
              ) : (
                <div className="flex flex-col gap-2">
                  <AnimatePresence mode="popLayout">
                    {items.map((item) => (
                      <motion.div
                        key={item.$jazz.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, x: 30 }}
                        transition={{
                          layout: {
                            type: 'spring',
                            stiffness: 150,
                            damping: 25,
                          },
                          opacity: { duration: 0.8, ease: 'easeInOut' },
                          scale: { duration: 0.8, ease: [0.34, 1.56, 0.64, 1] },
                          y: { duration: 1.0, ease: [0.34, 1.56, 0.64, 1] },
                          x: { duration: 0.8, ease: 'easeInOut' },
                        }}
                      >
                        <ShoppingSessionItemRow
                          item={item}
                          state={itemStates[item.$jazz.id] || null}
                          zone={zone}
                          onToggleCart={onToggleCart}
                          onTogglePurchased={onTogglePurchased}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

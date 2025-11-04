import { AnimatePresence, motion } from 'framer-motion';
import type { InstanceOfSchema } from 'jazz-tools';
import type { LucideIcon } from 'lucide-react';
import { TreeNode } from '@/components/tree/TreeNode';
import type { ItemState, TemplateItem } from '@/schemas/tree';
import { ShoppingSessionItemRow } from './ShoppingSessionItemRow';

interface SessionZoneProps {
  title: string;
  icon?: LucideIcon;
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
  icon: Icon,
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
      <TreeNode
        level={0}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        hasChildren={items.length > 0 || !!children}
      >
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-2 rounded px-2 py-1 -mx-2 w-full hover:bg-neutral-100 transition-colors"
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span className="flex-1 text-sm font-semibold text-neutral-900 text-left">{title}</span>
          {count !== undefined && (
            <motion.span
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
              className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700"
            >
              {count}
            </motion.span>
          )}
        </button>
      </TreeNode>

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
            <div className="pl-2">
              {children ? (
                children
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

import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { IndentedRow } from '@/components/tree/IndentedRow';
import type { ItemState, TemplateItem } from '@/schemas';
import { SessionItemRow } from './SessionItemRow';

interface SessionZoneProps {
  title: string;
  icon?: LucideIcon;
  zone: 'available' | 'selected' | 'checked';
  items: TemplateItem[];
  itemStates: Record<string, ItemState>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  count?: number;
  children?: React.ReactNode;
  showHeading?: boolean; // Controls whether to show the zone heading
  isTopLevelZone?: boolean; // Controls whether this is a top-level zone (for styling)
}

export function SessionZone({
  title,
  icon: Icon,
  zone,
  items,
  itemStates,
  expanded,
  onToggleExpand,
  onToggleSelected,
  onToggleChecked,
  count,
  children,
  showHeading = true,
  isTopLevelZone = false,
}: SessionZoneProps) {
  // Determine background class based on zone type - only for top-level available zone
  const bgClass = zone === 'available' && isTopLevelZone ? 'bg-blue-50 rounded-md' : '';
  const paddingClass = zone === 'available' && isTopLevelZone ? 'p-2' : '';

  // Content to render (items or children)
  const content = children ? (
    children
  ) : (
    <div className="flex flex-col">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
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
            <SessionItemRow
              item={item}
              state={itemStates[item.id] || null}
              zone={zone}
              onToggleSelected={onToggleSelected}
              onToggleChecked={onToggleChecked}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  // If headings are disabled, show content directly with a divider
  if (!showHeading) {
    return (
      <div className={bgClass}>
        <div className="border-t border-neutral-100 my-1" />
        {content}
      </div>
    );
  }

  // Normal mode with collapsible header
  return (
    <div className={`${bgClass} ${paddingClass}`}>
      {/* Zone header */}
      <IndentedRow
        level={0}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        hasChildren={items.length > 0 || !!children}
      >
        <div className="flex items-center gap-2 w-full">
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
        </div>
      </IndentedRow>

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
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

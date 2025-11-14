import type { LucideIcon } from 'lucide-react';
import { ListChecks, ListMinus, ListX } from 'lucide-react';
import { IndentedRow } from '@/components/tree/IndentedRow';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ItemState, TemplateItem } from '@/schemas';
import type { CategoryNode } from './categoryTreeBuilder';
import { collectAllItemIds, getSelectionState } from './categoryTreeUtils';
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
  onBatchSelectAll?: (itemIds: string[]) => void;
  onBatchDeselectAll?: (itemIds: string[]) => void;
  onBatchToggle?: (itemIds: string[]) => void;
  count?: number;
  children?: React.ReactNode;
  showHeading?: boolean; // Controls whether to show the zone heading
  isTopLevelZone?: boolean; // Controls whether this is a top-level zone (for styling)
  category?: CategoryNode | null; // Category node for batch operations
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  categoryItem?: TemplateItem; // The actual category item for selection
  isSelected?: boolean; // Category selection state
  onSelectItem?: (itemId: string | null) => void; // Category selection handler
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
  onBatchSelectAll,
  onBatchDeselectAll,
  onBatchToggle,
  count,
  children,
  showHeading = true,
  isTopLevelZone = false,
  category,
  showDeleteIcon = false,
  onDeleteItem,
  categoryItem,
  isSelected = false,
  onSelectItem,
}: SessionZoneProps) {
  console.log('[SessionZone] Category:', title, 'isSelected:', isSelected, 'hasOnSelectItem:', !!onSelectItem);
  // Determine background class based on zone type - only for top-level available zone
  const bgClass = zone === 'available' && isTopLevelZone ? 'bg-blue-50 rounded-md' : '';
  // Remove padding - let parent control all padding
  const paddingClass = '';

  // Get all item IDs for batch operations
  const allItemIds = category ? collectAllItemIds(category) : items.map((i) => i.id);
  const selectionState = category
    ? getSelectionState(category, itemStates)
    : getSelectionState(null, itemStates, items);

  // Content to render (items or children)
  const content = children ? (
    children
  ) : (
    <div className="flex flex-col">
      {items.map((item) => (
        <SessionItemRow
          key={item.id}
          item={item}
          state={itemStates[item.id] || null}
          zone={zone}
          onToggleSelected={onToggleSelected}
          onToggleChecked={onToggleChecked}
          showDeleteIcon={showDeleteIcon}
          onDeleteItem={onDeleteItem}
        />
      ))}
    </div>
  );

  // If headings are disabled, show content directly
  if (!showHeading) {
    return <div className={bgClass}>{content}</div>;
  }

  // Render batch selection buttons - always show all three
  const renderBatchButtons = () => {
    if (
      !onBatchSelectAll ||
      !onBatchDeselectAll ||
      !onBatchToggle ||
      allItemIds.length === 0 ||
      zone !== 'available'
    )
      return null;

    const handleSelectAll = (e: React.MouseEvent) => {
      e.stopPropagation();
      console.log('[SessionZone] Select All clicked', { allItemIds, selectionState });
      if (onBatchSelectAll && allItemIds.length > 0 && selectionState !== 'all') {
        onBatchSelectAll(allItemIds);
      }
    };

    const handleDeselectAll = (e: React.MouseEvent) => {
      e.stopPropagation();
      console.log('[SessionZone] Deselect All clicked', { allItemIds, selectionState });
      if (onBatchDeselectAll && allItemIds.length > 0 && selectionState !== 'none') {
        onBatchDeselectAll(allItemIds);
      }
    };

    const handleToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      console.log('[SessionZone] Toggle clicked', { allItemIds, selectionState });
      if (onBatchToggle && allItemIds.length > 0) {
        onBatchToggle(allItemIds);
      }
    };

    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1">
          {/* Select All */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={selectionState === 'all'}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ListChecks className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Select all items</p>
            </TooltipContent>
          </Tooltip>

          {/* Toggle Selection */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggle}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
              >
                <ListMinus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle selection</p>
            </TooltipContent>
          </Tooltip>

          {/* Deselect All */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selectionState === 'none'}
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ListX className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Deselect all items</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  };

  const handleCategoryClick = (e: React.MouseEvent) => {
    // Don't trigger selection if clicking on buttons or expand toggle
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('[data-expand-toggle]')
    ) {
      console.log('[SessionZone] Click ignored (button or toggle)');
      return;
    }

    if (onSelectItem && categoryItem) {
      const newValue = isSelected ? null : categoryItem.id;
      console.log('[SessionZone] Calling onSelectItem with:', newValue);
      onSelectItem(newValue);
    }
  };

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
        <div
          className={`flex items-center gap-2 w-full ${
            isSelected
              ? 'bg-green-100 ring-2 ring-green-500 ring-inset rounded'
              : ''
          } ${onSelectItem ? 'cursor-pointer' : ''}`}
          onClick={onSelectItem ? handleCategoryClick : undefined}
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span className={`flex-1 text-sm font-semibold text-left ${
            isSelected ? 'text-green-800' : 'text-neutral-900'
          }`}>{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
              {count}
            </span>
          )}
          {renderBatchButtons()}
        </div>
      </IndentedRow>

      {/* Zone items - no animations to avoid scroll jumping */}
      {expanded && <div className="overflow-hidden">{content}</div>}
    </div>
  );
}

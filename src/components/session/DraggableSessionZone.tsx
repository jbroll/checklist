import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LucideIcon } from 'lucide-react';
import type { ItemState, TemplateItem } from '@/schemas';
import type { CategoryNode } from './categoryTreeBuilder';
import { SessionZone } from './SessionZone';

interface DraggableSessionZoneProps {
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
  showHeading?: boolean;
  isTopLevelZone?: boolean;
  category?: CategoryNode | null;
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  categoryItem?: TemplateItem;
  isSelected?: boolean;
  onSelectItem?: (itemId: string | null) => void;
}

export function DraggableSessionZone(props: DraggableSessionZoneProps) {
  const { categoryItem } = props;

  // Only make draggable if it's actually a category (not the top-level zone)
  const isDraggable = categoryItem && categoryItem.type === 'category';

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: categoryItem?.id || 'root',
    data: {
      type: 'category',
      item: categoryItem,
    },
    disabled: !isDraggable,
  });

  const style = isDraggable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : {};

  const combinedAttributes = isDraggable ? attributes : {};
  const combinedListeners = isDraggable ? listeners : {};

  return (
    <div ref={setNodeRef} style={style} {...combinedAttributes} {...combinedListeners}>
      <SessionZone {...props} />
    </div>
  );
}

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemState, TemplateItem } from '@/schemas';
import { SessionItemRow } from './SessionItemRow';

interface DraggableSessionItemProps {
  item: TemplateItem;
  state: ItemState | null;
  zone: 'available' | 'selected' | 'checked';
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  isSelected?: boolean;
  onSelectItem?: (itemId: string | null) => void;
}

export function DraggableSessionItem(props: DraggableSessionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    data: {
      type: 'item',
      item: props.item,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SessionItemRow {...props} />
    </div>
  );
}

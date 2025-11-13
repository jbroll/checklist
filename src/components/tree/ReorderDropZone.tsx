import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface ReorderDropZoneProps {
  id: string;
  beforeItemId?: string; // ID of the item this zone is before
  afterItemId?: string; // ID of the item this zone is after
  parentPath?: string; // Parent path for context
  isDragging: boolean;
}

/**
 * ReorderDropZone - Thin drop zone between items for reordering
 *
 * This component creates a subtle drop target between items that becomes
 * interactive during drag operations. It uses existing spacing to avoid
 * layout shifts.
 */
export function ReorderDropZone({
  id,
  beforeItemId,
  afterItemId,
  parentPath,
  isDragging,
}: ReorderDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: 'reorder-zone',
      beforeItemId,
      afterItemId,
      parentPath,
    },
  });

  // Only show during drag operations
  if (!isDragging) {
    return null;
  }

  // Debug: log when zone is rendered
  console.log('ReorderDropZone rendered:', {
    id,
    beforeItemId,
    afterItemId,
    parentPath,
    isOver,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative h-2 transition-all bg-blue-50 border border-dashed border-blue-300',
        isOver && 'h-3 bg-green-100 border-green-500'
      )}
    >
      {/* Visual indicator on hover */}
      {isOver && (
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-1 bg-green-500 rounded-full" />
      )}
    </div>
  );
}

import { useDroppable } from '@dnd-kit/core';
import { Check, Plus } from 'lucide-react';

interface RootDropZoneProps {
  isDragging: boolean;
  folderName: string;
  onBack: () => void;
  onAddItem: () => void;
}

/**
 * Root-level drop zone for moving items back to the top level.
 * This component serves as a droppable target at the top of the items tree
 * and also contains the list header with name and action buttons.
 * Styled to match the shopping session header.
 */
export function RootDropZone({ isDragging, folderName, onBack, onAddItem }: RootDropZoneProps) {
  // Droppable setup for root-level drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'drop-__ROOT_DROP_ZONE__',
    data: { path: '__ROOT_DROP_ZONE__' },
  });

  return (
    <div
      ref={setDropRef}
      className={`px-4 py-4 border-b transition-all ${
        isDragging && isOver
          ? 'bg-green-50 border-green-500 border-2 border-dashed'
          : isDragging
            ? 'bg-neutral-50 border-neutral-200 border-2 border-dashed'
            : 'bg-white border-neutral-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-900">{folderName}</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Check className="h-4 w-4" />
            Finish Editing
          </button>
        </div>
      </div>
    </div>
  );
}

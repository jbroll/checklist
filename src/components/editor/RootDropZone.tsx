import { useDroppable } from '@dnd-kit/core';
import { CheckSquare, Plus } from 'lucide-react';

interface RootDropZoneProps {
  isDragging: boolean;
  folderName: string;
  onBack: () => void;
  onAddItem: () => void;
  onHeaderClick?: () => void;
}

/**
 * Root-level drop zone for moving items back to the top level.
 * This component serves as a droppable target at the top of the items tree
 * and also contains the list header with name and action buttons.
 * Styled to match the shopping session header.
 */
export function RootDropZone({
  isDragging,
  folderName,
  onBack,
  onAddItem,
  onHeaderClick,
}: RootDropZoneProps) {
  // Droppable setup for root-level drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'drop-__ROOT_DROP_ZONE__',
    data: { path: '__ROOT_DROP_ZONE__' },
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: div must be droppable target
    <div
      ref={setDropRef}
      onClick={onHeaderClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onHeaderClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      className={`px-4 py-4 border-b transition-all ${
        isDragging && isOver
          ? 'bg-green-50 dark:bg-green-900/30 border-green-500 border-2 border-dashed'
          : isDragging
            ? 'bg-surface-tertiary border-divider-primary border-2 border-dashed'
            : 'bg-surface-primary border-divider-secondary'
      }`}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-content-primary">{folderName}</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddItem();
            }}
            className="flex items-center gap-1 rounded-lg border border-green-600 bg-surface-primary px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
          >
            <Plus className="h-4 w-4" />
            <CheckSquare className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

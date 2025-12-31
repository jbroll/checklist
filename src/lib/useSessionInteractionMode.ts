import { useCallback, useState } from 'react';

// Helper to get timestamp in seconds with milliseconds
const getTimestamp = () => {
  const now = performance.now() / 1000;
  return now.toFixed(3);
};

/**
 * Interaction modes for SessionView
 *
 * NORMAL - Default state, all interactions available
 * ADDING - Add form is open, can still drag/edit
 * EDITING - One item/category is being edited, other interactions disabled
 * DRAGGING - Active drag operation, other interactions disabled
 */
export type InteractionMode =
  | { mode: 'normal' }
  | { mode: 'adding' }
  | { mode: 'editing'; itemId: string }
  | { mode: 'dragging'; itemId: string };

/**
 * Hook to manage interaction mode state machine for SessionView.
 * Ensures that conflicting interactions (edit, drag, add) don't happen simultaneously.
 *
 * Mode transitions:
 * - NORMAL to ADDING (open add form)
 * - NORMAL to EDITING (double-tap item)
 * - NORMAL/ADDING to DRAGGING (long-press drag)
 * - EDITING to NORMAL/ADDING (save/cancel edit)
 * - DRAGGING to NORMAL/ADDING (drop item)
 * - ADDING to NORMAL (close add form)
 */
export function useSessionInteractionMode(): {
  interactionMode: InteractionMode;
  isEditing: boolean;
  isDragging: boolean;
  isAdding: boolean;
  isNormal: boolean;
  activeItemId: string | null;
  enterAddMode: () => void;
  enterEditMode: (itemId: string) => void;
  enterDragMode: (itemId: string) => void;
  exitToNormal: () => void;
  exitToAdding: () => void;
  exitCurrentMode: (wasInAddMode: boolean) => void;
  canEdit: (itemId: string) => boolean;
  canDrag: (itemId: string) => boolean;
  canSelectForInsertion: () => boolean;
  canOpenAddForm: () => boolean;
} {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>({ mode: 'normal' });

  // Computed flags for easy consumption by child components
  const isEditing = interactionMode.mode === 'editing';
  const isDragging = interactionMode.mode === 'dragging';
  const isAdding = interactionMode.mode === 'adding';
  const isNormal = interactionMode.mode === 'normal';

  // Get the ID of the item currently being edited or dragged
  const activeItemId =
    interactionMode.mode === 'editing' || interactionMode.mode === 'dragging'
      ? interactionMode.itemId
      : null;

  // Mode transition functions
  const enterAddMode = useCallback(() => {
    setInteractionMode((prev) => {
      if (prev.mode !== 'adding') {
        console.log(`[${getTimestamp()}s] [InteractionMode] State changed:`, prev.mode, '→ ADDING');
      }
      return { mode: 'adding' };
    });
  }, []);

  const enterEditMode = useCallback((itemId: string) => {
    setInteractionMode((prev) => {
      if (prev.mode !== 'editing' || (prev.mode === 'editing' && prev.itemId !== itemId)) {
        console.log(
          `[${getTimestamp()}s] [InteractionMode] State changed:`,
          prev.mode,
          '→ EDITING (item:',
          itemId,
          ')',
        );
      }
      return { mode: 'editing', itemId };
    });
  }, []);

  const enterDragMode = useCallback((itemId: string) => {
    setInteractionMode((prev) => {
      if (prev.mode !== 'dragging' || (prev.mode === 'dragging' && prev.itemId !== itemId)) {
        console.log(
          `[${getTimestamp()}s] [InteractionMode] State changed:`,
          prev.mode,
          '→ DRAGGING (item:',
          itemId,
          ')',
        );
      }
      return { mode: 'dragging', itemId };
    });
  }, []);

  const exitToNormal = useCallback(() => {
    setInteractionMode((prev) => {
      if (prev.mode !== 'normal') {
        console.log(`[${getTimestamp()}s] [InteractionMode] State changed:`, prev.mode, '→ NORMAL');
      }
      return { mode: 'normal' };
    });
  }, []);

  const exitToAdding = useCallback(() => {
    setInteractionMode((prev) => {
      if (prev.mode !== 'adding') {
        console.log(`[${getTimestamp()}s] [InteractionMode] State changed:`, prev.mode, '→ ADDING');
      }
      return { mode: 'adding' };
    });
  }, []);

  // Helper: Exit edit/drag mode - returns to previous mode (ADDING or NORMAL)
  const exitCurrentMode = useCallback(
    (wasInAddMode: boolean) => {
      if (wasInAddMode) {
        exitToAdding();
      } else {
        exitToNormal();
      }
    },
    [exitToAdding, exitToNormal],
  );

  // Permission checks - can this interaction happen in current mode?
  const canEdit = useCallback(
    (itemId: string) => {
      // Can edit if: ADDING mode or already editing this specific item
      return isAdding || (isEditing && activeItemId === itemId);
    },
    [isAdding, isEditing, activeItemId],
  );

  const canDrag = useCallback(
    (itemId: string) => {
      // Dragging is allowed when in ADDING mode or already dragging this item
      return isAdding || (isDragging && activeItemId === itemId);
    },
    [isAdding, isDragging, activeItemId],
  );

  const canSelectForInsertion = useCallback(() => {
    // Can select insertion point if: ADDING mode and not editing
    return isAdding && !isEditing;
  }, [isAdding, isEditing]);

  const canOpenAddForm = useCallback(() => {
    // Can open add form if: NORMAL mode (not editing or dragging)
    return isNormal;
  }, [isNormal]);

  return {
    // Current state
    interactionMode,
    isEditing,
    isDragging,
    isAdding,
    isNormal,
    activeItemId,

    // Transitions
    enterAddMode,
    enterEditMode,
    enterDragMode,
    exitToNormal,
    exitToAdding,
    exitCurrentMode,

    // Permission checks
    canEdit,
    canDrag,
    canSelectForInsertion,
    canOpenAddForm,
  };
}

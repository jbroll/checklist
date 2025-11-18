import { useCallback, useState } from 'react';

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
export function useSessionInteractionMode(options?: { simplifiedUI?: boolean }) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>({ mode: 'normal' });
  const simplifiedUI = options?.simplifiedUI ?? false;

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
    console.log('[InteractionMode] Entering ADD mode');
    setInteractionMode({ mode: 'adding' });
  }, []);

  const enterEditMode = useCallback((itemId: string) => {
    console.log('[InteractionMode] Entering EDIT mode for item:', itemId);
    setInteractionMode({ mode: 'editing', itemId });
  }, []);

  const enterDragMode = useCallback((itemId: string) => {
    console.log('[InteractionMode] Entering DRAG mode for item:', itemId);
    setInteractionMode({ mode: 'dragging', itemId });
  }, []);

  const exitToNormal = useCallback(() => {
    console.log('[InteractionMode] Exiting to NORMAL mode');
    setInteractionMode({ mode: 'normal' });
  }, []);

  const exitToAdding = useCallback(() => {
    console.log('[InteractionMode] Exiting to ADDING mode');
    setInteractionMode({ mode: 'adding' });
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
      // Can edit if: NORMAL, ADDING, or already editing this specific item
      const result = isNormal || isAdding || (isEditing && activeItemId === itemId);
      console.log(
        '[InteractionMode] canEdit?',
        itemId,
        '=',
        result,
        '(mode:',
        interactionMode.mode,
        ')',
      );
      return result;
    },
    [isNormal, isAdding, isEditing, activeItemId, interactionMode],
  );

  const canDrag = useCallback(
    (itemId: string) => {
      // Classic UI: Can drag if NORMAL, ADDING, or already dragging this item
      // Simplified UI: Can drag ONLY in ADDING mode or if already dragging this item
      const result = simplifiedUI
        ? isAdding || (isDragging && activeItemId === itemId)
        : isNormal || isAdding || (isDragging && activeItemId === itemId);
      console.log(
        '[InteractionMode] canDrag?',
        itemId,
        '=',
        result,
        '(mode:',
        interactionMode.mode,
        simplifiedUI ? '[Simplified UI]' : '[Classic UI]',
        ')',
      );
      return result;
    },
    [simplifiedUI, isAdding, isNormal, isDragging, activeItemId, interactionMode],
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

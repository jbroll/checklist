import { useCallback, useRef, useState } from 'react';

/**
 * State machine for item interactions in SessionView edit mode.
 *
 * Interaction Model:
 * - Single click/tap (quick press/release): Select item for insertion point
 * - Long press (> 1.5s): Enter edit mode (text input)
 * - Press + drag (< 1.5s + move): Enter drag mode, activate drop zones
 *
 * States:
 * - idle: No interaction
 * - pressing: Pointer down, waiting to determine intent
 * - dragging: Item is being dragged
 * - editing: Item is in edit mode
 *
 * The dnd-kit library handles drag activation, but we need to coordinate
 * with edit mode and selection to avoid conflicts.
 */

type InteractionState = 'idle' | 'pressing' | 'dragging' | 'editing';

interface UseItemInteractionOptions {
  onSelect?: () => void;
  onStartEdit?: () => void;
  onEndEdit?: () => void;
  isDragging?: boolean; // From dnd-kit useDraggable
  editModeEnabled?: boolean; // Enable long-press to edit
  dragEnabled?: boolean; // Reserved for future use - may control drag behavior
}

export function useItemInteraction({
  onSelect,
  onStartEdit,
  onEndEdit,
  isDragging = false,
  editModeEnabled = false,
  // @ts-expect-error - Reserved for future use
  // biome-ignore lint/correctness/noUnusedFunctionParameters: Reserved for future drag functionality
  dragEnabled = false,
}: UseItemInteractionOptions) {
  const [state, setStateRaw] = useState<InteractionState>('idle');
  const stateRef = useRef<InteractionState>('idle');
  const pressStartTime = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMovedRef = useRef(false);

  // Wrapper that updates ref synchronously for use in setTimeout callbacks
  const setState = useCallback((newState: InteractionState) => {
    stateRef.current = newState;
    setStateRaw(newState);
  }, []);

  // Clean up timer
  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Sync with dnd-kit drag state
  const syncDragState = useCallback(() => {
    if (isDragging && state !== 'dragging') {
      setState('dragging');
      clearTimer();
    } else if (!isDragging && state === 'dragging') {
      setState('idle');
    }
  }, [isDragging, state, clearTimer, setState]);

  // Call this effect externally or use useEffect
  // We expose it so caller can sync when isDragging changes
  const handleDragChange = useCallback(() => {
    syncDragState();
  }, [syncDragState]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't interfere with button clicks
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }

      pressStartTime.current = Date.now();
      hasMovedRef.current = false;
      setState('pressing');

      // Start long press timer for edit mode (only if edit is enabled)
      if (editModeEnabled && onStartEdit) {
        clearTimer();
        longPressTimer.current = setTimeout(() => {
          // Only enter edit mode if we haven't started dragging
          // Use stateRef.current to avoid stale closure over state
          if (stateRef.current === 'pressing' && !isDragging && !hasMovedRef.current) {
            setState('editing');
            onStartEdit();
          }
        }, 1500); // 1.5 seconds
      }
    },
    [editModeEnabled, onStartEdit, clearTimer, isDragging, setState],
  );

  const handlePointerMove = useCallback(
    (_e: React.PointerEvent) => {
      if (state === 'pressing' && !hasMovedRef.current) {
        // Movement detected - cancel long press timer
        // Drag will be handled by dnd-kit if enabled
        hasMovedRef.current = true;
        clearTimer();
      }
    },
    [state, clearTimer],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Don't interfere with button clicks
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }

      clearTimer();

      // Only handle selection if:
      // 1. We were in pressing state (not dragging or editing)
      // 2. Press was short (< 1.5s)
      // 3. No movement occurred (not a drag)
      if (state === 'pressing' && !hasMovedRef.current) {
        const pressDuration = pressStartTime.current ? Date.now() - pressStartTime.current : 0;

        if (pressDuration < 1500 && onSelect) {
          onSelect();
        }
      }

      // Reset state (unless we're in editing mode)
      if (state !== 'editing') {
        setState('idle');
      }

      pressStartTime.current = null;
      hasMovedRef.current = false;
    },
    [state, onSelect, clearTimer, setState],
  );

  const handlePointerCancel = useCallback(() => {
    clearTimer();
    setState('idle');
    pressStartTime.current = null;
    hasMovedRef.current = false;
  }, [clearTimer, setState]);

  const exitEditMode = useCallback(() => {
    setState('idle');
    if (onEndEdit) {
      onEndEdit();
    }
  }, [onEndEdit, setState]);

  return {
    state,
    isEditing: state === 'editing',
    isDraggingState: state === 'dragging',
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
    exitEditMode,
    handleDragChange, // Call this when isDragging changes
  };
}

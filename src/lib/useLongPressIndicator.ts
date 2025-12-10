import { useEffect, useRef, useState } from 'react';

/**
 * Hook to provide visual feedback during long press drag activation.
 * Returns true when user is holding but drag hasn't started yet.
 */
export function useLongPressIndicator(isDragging: boolean) {
  const [isHolding, setIsHolding] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset holding state when drag starts
    if (isDragging) {
      setIsHolding(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isDragging]);

  const handlePointerDown = () => {
    // Don't show holding feedback immediately - wait 200ms to differentiate from click/double-click
    timeoutRef.current = window.setTimeout(() => {
      setIsHolding(true);
      // Clear holding state after 800ms more (total 1 second when drag activates)
      timeoutRef.current = window.setTimeout(() => {
        setIsHolding(false);
      }, 800);
    }, 200);
  };

  const handlePointerUp = () => {
    setIsHolding(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handlePointerCancel = () => {
    setIsHolding(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isHolding,
    longPressHandlers: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}

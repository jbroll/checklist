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
    setIsHolding(true);
    // Clear holding state after 1 second (when drag activates)
    timeoutRef.current = window.setTimeout(() => {
      setIsHolding(false);
    }, 1000);
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

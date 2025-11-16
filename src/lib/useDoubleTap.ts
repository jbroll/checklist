import { useCallback, useRef } from 'react';

interface UseDoubleTapOptions {
  onDoubleTap: (e: React.MouseEvent | React.TouchEvent) => void;
  delay?: number; // Time window for second tap (ms)
}

/**
 * Custom hook for detecting double-tap/double-click gestures.
 * Works reliably on both desktop (mouse) and mobile (touch).
 *
 * onDoubleClick doesn't work consistently on mobile, especially iOS Safari.
 * This hook handles both click and touch events properly.
 */
export function useDoubleTap({ onDoubleTap, delay = 300 }: UseDoubleTapOptions) {
  const lastTapTime = useRef<number>(0);
  const lastTouchTime = useRef<number>(0);

  const handleInteraction = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime.current;

      // Prevent synthetic click events after touch events
      // On mobile, touch fires both touchend and click ~50-100ms apart
      if (e.type === 'click' && now - lastTouchTime.current < 500) {
        return; // Ignore synthetic click
      }

      if (timeSinceLastTap < delay && timeSinceLastTap > 0) {
        // Double tap detected
        e.preventDefault();
        onDoubleTap(e);
        lastTapTime.current = 0; // Reset to prevent triple-tap
      } else {
        // First tap
        lastTapTime.current = now;
      }

      // Track touch events to filter out synthetic clicks
      if (e.type === 'touchend') {
        lastTouchTime.current = now;
      }
    },
    [onDoubleTap, delay],
  );

  return {
    onClick: handleInteraction,
    onTouchEnd: handleInteraction,
  };
}

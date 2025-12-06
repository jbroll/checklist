import { useLayoutEffect, useRef } from 'react';

interface UseScrollPreservationOptions {
  selectedItemsCount: number;
  checkedItemsCount: number;
  showAddForm: boolean;
}

/**
 * Hook to preserve scroll position when items move between zones.
 * Keeps the Available Items zone at the same viewport position when
 * items are selected/deselected, preventing jarring scroll jumps.
 */
export function useScrollPreservation({
  selectedItemsCount,
  checkedItemsCount,
  showAddForm,
}: UseScrollPreservationOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const availableZoneRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const prevSelectedCountRef = useRef(0);
  const prevCheckedCountRef = useRef(0);
  const savedScrollInfoRef = useRef<{
    availableZoneTop: number;
  } | null>(null);

  // Capture the current Available zone position before a state change
  const captureScrollPosition = () => {
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;

    if (container && availableZone) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      savedScrollInfoRef.current = {
        availableZoneTop: availableRect.top - containerRect.top,
      };
    }
  };

  // Restore scroll position after DOM updates but before paint
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const availableZone = availableZoneRef.current;
    if (!container || !availableZone || showAddForm) return;

    // Update prev counts for next render
    prevSelectedCountRef.current = selectedItemsCount;
    prevCheckedCountRef.current = checkedItemsCount;

    // If we have saved scroll info, restore the Available zone position
    if (savedScrollInfoRef.current) {
      const containerRect = container.getBoundingClientRect();
      const availableRect = availableZone.getBoundingClientRect();

      // Calculate where the Available zone is NOW
      const currentAvailableTop = availableRect.top - containerRect.top;

      // Calculate where we WANT it to be (same as before)
      const targetAvailableTop = savedScrollInfoRef.current.availableZoneTop;

      // Calculate the difference
      const diff = currentAvailableTop - targetAvailableTop;

      // Adjust scroll to keep Available zone in the same viewport position
      if (Math.abs(diff) > 0.5) {
        container.scrollTop = container.scrollTop + diff;
      }

      // Clear saved info after applying
      savedScrollInfoRef.current = null;
    }
  }, [selectedItemsCount, checkedItemsCount, showAddForm]);

  return {
    scrollContainerRef,
    availableZoneRef,
    anchorRef,
    captureScrollPosition,
  };
}

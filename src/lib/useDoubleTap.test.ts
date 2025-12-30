/**
 * Unit tests for useDoubleTap hook
 *
 * Tests double-tap detection for both mouse and touch events.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDoubleTap } from './useDoubleTap';

describe('useDoubleTap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMouseEvent = (type = 'click') =>
    ({
      type,
      preventDefault: vi.fn(),
    }) as unknown as React.MouseEvent;

  const createTouchEvent = (type = 'touchend') =>
    ({
      type,
      preventDefault: vi.fn(),
    }) as unknown as React.TouchEvent;

  describe('click events (desktop)', () => {
    it('does not trigger on single click', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it('triggers on double click within delay', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      act(() => {
        result.current.onClick(createMouseEvent());
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      const event = createMouseEvent();
      act(() => {
        result.current.onClick(event);
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
      expect(onDoubleTap).toHaveBeenCalledWith(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('does not trigger if second click is after delay', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap, delay: 300 }));

      act(() => {
        result.current.onClick(createMouseEvent());
      });

      act(() => {
        vi.advanceTimersByTime(350);
      });

      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it('respects custom delay', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap, delay: 500 }));

      act(() => {
        result.current.onClick(createMouseEvent());
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });

    it('resets after double tap (prevents triple-tap)', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      // First double-tap
      act(() => {
        result.current.onClick(createMouseEvent());
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);

      // Third tap immediately after should not trigger
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });
  });

  describe('touch events (mobile)', () => {
    it('triggers on double touch', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      act(() => {
        result.current.onTouchEnd(createTouchEvent());
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      const event = createTouchEvent();
      act(() => {
        result.current.onTouchEnd(event);
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('filters synthetic click after touch', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      // First touch
      act(() => {
        result.current.onTouchEnd(createTouchEvent());
      });

      // Synthetic click ~50ms later (should be ignored)
      act(() => {
        vi.advanceTimersByTime(50);
      });
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      // Second touch
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        result.current.onTouchEnd(createTouchEvent());
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });

    it('allows click after 500ms from touch', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      // Touch event
      act(() => {
        result.current.onTouchEnd(createTouchEvent());
      });

      // Wait 600ms (past the 500ms filter window)
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Click should not be filtered
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      // This should count as the "first" tap since touch was too long ago
      // Another quick click should trigger double-tap
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });
  });

  describe('mixed events', () => {
    it('handles touch followed by non-synthetic click correctly', () => {
      const onDoubleTap = vi.fn();
      const { result } = renderHook(() => useDoubleTap({ onDoubleTap }));

      // Touch event
      act(() => {
        result.current.onTouchEnd(createTouchEvent());
      });

      // Wait past the synthetic click filter window
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Real click (user switched to mouse)
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      // Quick second click
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });
  });

  describe('handler updates', () => {
    it('uses latest callback', () => {
      const onDoubleTap1 = vi.fn();
      const onDoubleTap2 = vi.fn();

      const { result, rerender } = renderHook(({ onDoubleTap }) => useDoubleTap({ onDoubleTap }), {
        initialProps: { onDoubleTap: onDoubleTap1 },
      });

      // First click
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      // Update callback
      rerender({ onDoubleTap: onDoubleTap2 });

      // Second click
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        result.current.onClick(createMouseEvent());
      });

      expect(onDoubleTap1).not.toHaveBeenCalled();
      expect(onDoubleTap2).toHaveBeenCalledTimes(1);
    });
  });
});

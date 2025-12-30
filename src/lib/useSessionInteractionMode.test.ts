/**
 * Unit tests for session interaction mode state machine
 *
 * Tests mode transitions and permission checks.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionInteractionMode } from './useSessionInteractionMode';

describe('useSessionInteractionMode', () => {
  beforeEach(() => {
    // Silence console.log from state transitions
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('initial state', () => {
    it('starts in normal mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      expect(result.current.interactionMode).toEqual({ mode: 'normal' });
      expect(result.current.isNormal).toBe(true);
      expect(result.current.isEditing).toBe(false);
      expect(result.current.isDragging).toBe(false);
      expect(result.current.isAdding).toBe(false);
      expect(result.current.activeItemId).toBe(null);
    });
  });

  describe('enterAddMode', () => {
    it('transitions from normal to adding mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });

      expect(result.current.interactionMode).toEqual({ mode: 'adding' });
      expect(result.current.isAdding).toBe(true);
      expect(result.current.isNormal).toBe(false);
    });

    it('stays in adding mode if already adding', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });
      act(() => {
        result.current.enterAddMode();
      });

      expect(result.current.interactionMode).toEqual({ mode: 'adding' });
    });
  });

  describe('enterEditMode', () => {
    it('transitions to editing mode with item ID', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.interactionMode).toEqual({ mode: 'editing', itemId: 'item-123' });
      expect(result.current.isEditing).toBe(true);
      expect(result.current.activeItemId).toBe('item-123');
    });

    it('can switch to editing a different item', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });
      act(() => {
        result.current.enterEditMode('item-456');
      });

      expect(result.current.activeItemId).toBe('item-456');
    });

    it('transitions from adding to editing', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });
      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.isEditing).toBe(true);
      expect(result.current.isAdding).toBe(false);
    });
  });

  describe('enterDragMode', () => {
    it('transitions to dragging mode with item ID', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.interactionMode).toEqual({ mode: 'dragging', itemId: 'item-123' });
      expect(result.current.isDragging).toBe(true);
      expect(result.current.activeItemId).toBe('item-123');
    });

    it('can switch to dragging a different item', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });
      act(() => {
        result.current.enterDragMode('item-456');
      });

      expect(result.current.activeItemId).toBe('item-456');
    });

    it('transitions from adding to dragging', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });
      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.isDragging).toBe(true);
      expect(result.current.isAdding).toBe(false);
    });
  });

  describe('exitToNormal', () => {
    it('transitions from adding to normal', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });
      act(() => {
        result.current.exitToNormal();
      });

      expect(result.current.isNormal).toBe(true);
      expect(result.current.isAdding).toBe(false);
    });

    it('transitions from editing to normal', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });
      act(() => {
        result.current.exitToNormal();
      });

      expect(result.current.isNormal).toBe(true);
      expect(result.current.isEditing).toBe(false);
      expect(result.current.activeItemId).toBe(null);
    });

    it('transitions from dragging to normal', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });
      act(() => {
        result.current.exitToNormal();
      });

      expect(result.current.isNormal).toBe(true);
      expect(result.current.isDragging).toBe(false);
    });

    it('stays in normal if already normal', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.exitToNormal();
      });

      expect(result.current.isNormal).toBe(true);
    });
  });

  describe('exitToAdding', () => {
    it('transitions from editing to adding', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });
      act(() => {
        result.current.exitToAdding();
      });

      expect(result.current.isAdding).toBe(true);
      expect(result.current.isEditing).toBe(false);
    });

    it('transitions from dragging to adding', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });
      act(() => {
        result.current.exitToAdding();
      });

      expect(result.current.isAdding).toBe(true);
      expect(result.current.isDragging).toBe(false);
    });
  });

  describe('exitCurrentMode', () => {
    it('exits to adding when wasInAddMode is true', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });
      act(() => {
        result.current.exitCurrentMode(true);
      });

      expect(result.current.isAdding).toBe(true);
    });

    it('exits to normal when wasInAddMode is false', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });
      act(() => {
        result.current.exitCurrentMode(false);
      });

      expect(result.current.isNormal).toBe(true);
    });
  });

  describe('canEdit permission', () => {
    it('returns true in adding mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });

      expect(result.current.canEdit('any-item')).toBe(true);
    });

    it('returns true when editing the same item', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.canEdit('item-123')).toBe(true);
    });

    it('returns false when editing a different item', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.canEdit('item-456')).toBe(false);
    });

    it('returns false in normal mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      expect(result.current.canEdit('any-item')).toBe(false);
    });

    it('returns false in dragging mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.canEdit('item-123')).toBe(false);
    });
  });

  describe('canDrag permission', () => {
    it('returns true in adding mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });

      expect(result.current.canDrag('any-item')).toBe(true);
    });

    it('returns true when dragging the same item', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.canDrag('item-123')).toBe(true);
    });

    it('returns false when dragging a different item', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.canDrag('item-456')).toBe(false);
    });

    it('returns false in normal mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      expect(result.current.canDrag('any-item')).toBe(false);
    });

    it('returns false in editing mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.canDrag('item-123')).toBe(false);
    });
  });

  describe('canSelectForInsertion permission', () => {
    it('returns true in adding mode when not editing', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });

      expect(result.current.canSelectForInsertion()).toBe(true);
    });

    it('returns false in normal mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      expect(result.current.canSelectForInsertion()).toBe(false);
    });

    it('returns false in editing mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.canSelectForInsertion()).toBe(false);
    });

    it('returns false in dragging mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.canSelectForInsertion()).toBe(false);
    });
  });

  describe('canOpenAddForm permission', () => {
    it('returns true in normal mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      expect(result.current.canOpenAddForm()).toBe(true);
    });

    it('returns false in adding mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });

      expect(result.current.canOpenAddForm()).toBe(false);
    });

    it('returns false in editing mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterEditMode('item-123');
      });

      expect(result.current.canOpenAddForm()).toBe(false);
    });

    it('returns false in dragging mode', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterDragMode('item-123');
      });

      expect(result.current.canOpenAddForm()).toBe(false);
    });
  });

  describe('complex transitions', () => {
    it('handles normal -> adding -> editing -> normal flow', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      expect(result.current.isNormal).toBe(true);

      act(() => {
        result.current.enterAddMode();
      });
      expect(result.current.isAdding).toBe(true);

      act(() => {
        result.current.enterEditMode('item-1');
      });
      expect(result.current.isEditing).toBe(true);

      act(() => {
        result.current.exitToNormal();
      });
      expect(result.current.isNormal).toBe(true);
    });

    it('handles normal -> adding -> dragging -> adding flow', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
      });
      act(() => {
        result.current.enterDragMode('item-1');
      });
      act(() => {
        result.current.exitToAdding();
      });

      expect(result.current.isAdding).toBe(true);
    });

    it('handles rapid mode changes', () => {
      const { result } = renderHook(() => useSessionInteractionMode());

      act(() => {
        result.current.enterAddMode();
        result.current.enterEditMode('item-1');
        result.current.enterDragMode('item-2');
        result.current.exitToNormal();
      });

      expect(result.current.isNormal).toBe(true);
      expect(result.current.activeItemId).toBe(null);
    });
  });
});

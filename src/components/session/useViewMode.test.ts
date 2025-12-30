/**
 * Unit tests for useViewMode hook
 *
 * Tests view mode cycling and UI label/icon generation.
 */

import { renderHook } from '@testing-library/react';
import { FolderTree, List } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { useViewMode } from './useViewMode';

// Mock the SessionService
vi.mock('@/services/sessionService', () => ({
  updateViewMode: vi.fn(),
}));

import * as SessionService from '@/services/sessionService';

const mockUpdateViewMode = SessionService.updateViewMode as ReturnType<typeof vi.fn>;

describe('useViewMode', () => {
  const mockTemplate = {
    $jazz: { id: 'template-1' },
  } as any;

  const mockMe = { id: 'user-1' } as any;

  beforeEach(() => {
    mockUpdateViewMode.mockReset();
  });

  describe('currentViewMode', () => {
    it('returns zone-in-hierarchy when session has no viewMode', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.currentViewMode).toBe('zone-in-hierarchy');
    });

    it('returns zone-in-hierarchy when session is null', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.currentViewMode).toBe('zone-in-hierarchy');
    });

    it('returns flat when session viewMode is flat', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'flat', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.currentViewMode).toBe('flat');
    });

    it('returns zone-in-hierarchy when session viewMode is zone-in-hierarchy', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'zone-in-hierarchy', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.currentViewMode).toBe('zone-in-hierarchy');
    });
  });

  describe('cycleViewMode', () => {
    it('cycles from zone-in-hierarchy to flat', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'zone-in-hierarchy', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      result.current.cycleViewMode();

      expect(mockUpdateViewMode).toHaveBeenCalledWith(mockMe, 'template-1', 'session-1', 'flat');
    });

    it('cycles from flat to zone-in-hierarchy', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'flat', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      result.current.cycleViewMode();

      expect(mockUpdateViewMode).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'zone-in-hierarchy',
      );
    });

    it('cycles from undefined to flat (default is zone-in-hierarchy)', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      result.current.cycleViewMode();

      expect(mockUpdateViewMode).toHaveBeenCalledWith(mockMe, 'template-1', 'session-1', 'flat');
    });

    it('does nothing when session is null', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      result.current.cycleViewMode();

      expect(mockUpdateViewMode).not.toHaveBeenCalled();
    });

    it('does nothing when me is null', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'flat', itemStates: {} },
          sessionId: 'session-1',
          me: null,
        }),
      );

      result.current.cycleViewMode();

      expect(mockUpdateViewMode).not.toHaveBeenCalled();
    });
  });

  describe('getViewModeLabel', () => {
    it('returns "Flat" for flat mode', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'flat', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.getViewModeLabel()).toBe('Flat');
    });

    it('returns "Zones in Categories" for zone-in-hierarchy mode', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'zone-in-hierarchy', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.getViewModeLabel()).toBe('Zones in Categories');
    });

    it('returns "Zones in Categories" when mode is undefined', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.getViewModeLabel()).toBe('Zones in Categories');
    });
  });

  describe('getViewModeIcon', () => {
    it('returns List icon for flat mode', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'flat', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.getViewModeIcon()).toBe(List);
    });

    it('returns FolderTree icon for zone-in-hierarchy mode', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { viewMode: 'zone-in-hierarchy', itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.getViewModeIcon()).toBe(FolderTree);
    });

    it('returns FolderTree icon when mode is undefined', () => {
      const { result } = renderHook(() =>
        useViewMode({
          template: mockTemplate,
          session: { itemStates: {} },
          sessionId: 'session-1',
          me: mockMe,
        }),
      );

      expect(result.current.getViewModeIcon()).toBe(FolderTree);
    });
  });
});

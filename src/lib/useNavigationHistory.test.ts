/**
 * Unit tests for navigation history hook
 *
 * Tests URL hash parsing, navigation state, and browser history integration.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavigationHistory } from './useNavigationHistory';

// Mock window.history and window.location
const mockHistory = {
  pushState: vi.fn(),
  replaceState: vi.fn(),
  back: vi.fn(),
  length: 1,
};

const mockLocation = {
  hash: '',
  pathname: '/',
};

describe('useNavigationHistory', () => {
  let originalLocation: Location;
  let originalHistory: History;
  let popStateListeners: ((e: PopStateEvent) => void)[] = [];

  beforeEach(() => {
    // Save originals
    originalLocation = window.location;
    originalHistory = window.history;

    // Mock location
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    // Mock history
    Object.defineProperty(window, 'history', {
      value: mockHistory,
      writable: true,
      configurable: true,
    });

    // Reset mocks
    mockHistory.pushState.mockClear();
    mockHistory.replaceState.mockClear();
    mockHistory.back.mockClear();
    mockHistory.length = 1;
    mockLocation.hash = '';
    mockLocation.pathname = '/';
    popStateListeners = [];

    // Mock addEventListener for popstate
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'popstate') {
        popStateListeners.push(handler as (e: PopStateEvent) => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((event, handler) => {
      if (event === 'popstate') {
        popStateListeners = popStateListeners.filter((h) => h !== handler);
      }
    });
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: originalHistory,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('parseHash (via initial state)', () => {
    it('returns main view for empty hash', () => {
      mockLocation.hash = '';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({ view: 'main' });
    });

    it('returns main view for root hash', () => {
      mockLocation.hash = '#/';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({ view: 'main' });
    });

    it('parses session view hash', () => {
      mockLocation.hash = '#session/template-123/session-456';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({
        view: 'session',
        templateId: 'template-123',
        sessionId: 'session-456',
      });
    });

    it('parses session edit view hash', () => {
      mockLocation.hash = '#session/template-123/session-456/edit';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({
        view: 'session',
        templateId: 'template-123',
        sessionId: 'session-456',
        editing: true,
      });
    });

    it('returns main view for invalid hash patterns', () => {
      mockLocation.hash = '#invalid/path';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({ view: 'main' });
    });

    it('handles hash with special characters in IDs', () => {
      mockLocation.hash = '#session/abc123/def456';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({
        view: 'session',
        templateId: 'abc123',
        sessionId: 'def456',
      });
    });

    it('returns main view for partial session path', () => {
      mockLocation.hash = '#session/template-only';
      const { result } = renderHook(() => useNavigationHistory());
      expect(result.current.navState).toEqual({ view: 'main' });
    });
  });

  describe('navigateTo', () => {
    it('pushes new state to history for session view', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({
          view: 'session',
          templateId: 'template-1',
          sessionId: 'session-1',
        });
      });

      expect(mockHistory.pushState).toHaveBeenCalledWith(null, '', '#session/template-1/session-1');
      expect(result.current.navState).toEqual({
        view: 'session',
        templateId: 'template-1',
        sessionId: 'session-1',
      });
    });

    it('pushes edit state to history', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({
          view: 'session',
          templateId: 'template-1',
          sessionId: 'session-1',
          editing: true,
        });
      });

      expect(mockHistory.pushState).toHaveBeenCalledWith(
        null,
        '',
        '#session/template-1/session-1/edit',
      );
    });

    it('clears hash when navigating to main view', () => {
      mockLocation.hash = '#session/t/s';
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({ view: 'main' });
      });

      expect(mockHistory.pushState).toHaveBeenCalledWith(null, '', '/');
    });

    it('does not push state if hash is unchanged', () => {
      mockLocation.hash = '#session/t1/s1';
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({
          view: 'session',
          templateId: 't1',
          sessionId: 's1',
        });
      });

      // Should still update local state but not push to history
      expect(mockHistory.pushState).not.toHaveBeenCalled();
    });
  });

  describe('replaceState', () => {
    it('replaces history entry without pushing', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.replaceState({
          view: 'session',
          templateId: 'template-1',
          sessionId: 'session-1',
        });
      });

      expect(mockHistory.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '#session/template-1/session-1',
      );
      expect(mockHistory.pushState).not.toHaveBeenCalled();
    });

    it('clears hash when replacing with main view', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.replaceState({ view: 'main' });
      });

      expect(mockHistory.replaceState).toHaveBeenCalledWith(null, '', '/');
    });
  });

  describe('goBack', () => {
    it('calls history.back when there is history', () => {
      mockHistory.length = 5;
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.goBack();
      });

      expect(mockHistory.back).toHaveBeenCalled();
    });

    it('navigates to main when no history available', () => {
      mockHistory.length = 1;
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.goBack();
      });

      expect(mockHistory.back).not.toHaveBeenCalled();
      expect(result.current.navState).toEqual({ view: 'main' });
    });
  });

  describe('popstate event handling', () => {
    it('registers popstate listener on mount', () => {
      renderHook(() => useNavigationHistory());
      expect(window.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    it('removes popstate listener on unmount', () => {
      const { unmount } = renderHook(() => useNavigationHistory());
      unmount();
      expect(window.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    it('updates state when popstate fires', () => {
      mockLocation.hash = '';
      const { result } = renderHook(() => useNavigationHistory());

      expect(result.current.navState).toEqual({ view: 'main' });

      // Simulate browser navigation
      mockLocation.hash = '#session/t1/s1';
      act(() => {
        popStateListeners.forEach((listener) => {
          listener(new PopStateEvent('popstate'));
        });
      });

      expect(result.current.navState).toEqual({
        view: 'session',
        templateId: 't1',
        sessionId: 's1',
      });
    });
  });

  describe('stateToHash (via navigation)', () => {
    it('generates correct hash for session without editing', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({
          view: 'session',
          templateId: 'abc',
          sessionId: 'xyz',
        });
      });

      expect(mockHistory.pushState).toHaveBeenCalledWith(null, '', '#session/abc/xyz');
    });

    it('generates correct hash for session with editing', () => {
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({
          view: 'session',
          templateId: 'abc',
          sessionId: 'xyz',
          editing: true,
        });
      });

      expect(mockHistory.pushState).toHaveBeenCalledWith(null, '', '#session/abc/xyz/edit');
    });

    it('generates empty hash for main view', () => {
      mockLocation.hash = '#session/t/s';
      const { result } = renderHook(() => useNavigationHistory());

      act(() => {
        result.current.navigateTo({ view: 'main' });
      });

      expect(mockHistory.pushState).toHaveBeenCalledWith(null, '', '/');
    });
  });
});

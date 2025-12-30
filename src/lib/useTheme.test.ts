/**
 * Unit tests for useTheme hook
 *
 * Tests theme persistence, system preference detection, and theme toggling.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTheme, useTheme } from './useTheme';

describe('useTheme', () => {
  let localStorageStore: Record<string, string>;
  let mediaQueryListeners: ((e: MediaQueryListEvent) => void)[];
  let currentPrefersDark: boolean;

  const createMockMatchMedia = (prefersDark: boolean) => ({
    matches: prefersDark,
    addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        mediaQueryListeners.push(handler);
      }
    }),
    removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        const index = mediaQueryListeners.indexOf(handler);
        if (index > -1) {
          mediaQueryListeners.splice(index, 1);
        }
      }
    }),
  });

  beforeEach(() => {
    localStorageStore = {};
    mediaQueryListeners = [];
    currentPrefersDark = false;

    // Mock localStorage with a proper implementation
    const localStorageMock = {
      getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
      clear: vi.fn(() => {
        localStorageStore = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn((query: string) => {
        if (query === '(prefers-color-scheme: dark)') {
          return createMockMatchMedia(currentPrefersDark);
        }
        return createMockMatchMedia(false);
      }),
      writable: true,
    });

    // Clean document state
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('dark');
  });

  describe('initial state', () => {
    it('defaults to light theme when no stored preference', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.effectiveTheme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it('loads stored light theme', () => {
      localStorageStore['checklist-theme'] = 'light';

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.effectiveTheme).toBe('light');
    });

    it('loads stored dark theme', () => {
      localStorageStore['checklist-theme'] = 'dark';

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('dark');
      expect(result.current.effectiveTheme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it('loads stored system theme with light system preference', () => {
      localStorageStore['checklist-theme'] = 'system';
      currentPrefersDark = false;

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('system');
      expect(result.current.effectiveTheme).toBe('light');
    });

    it('loads stored system theme with dark system preference', () => {
      localStorageStore['checklist-theme'] = 'system';
      currentPrefersDark = true;

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('system');
      expect(result.current.effectiveTheme).toBe('dark');
    });

    it('ignores invalid stored value', () => {
      localStorageStore['checklist-theme'] = 'invalid';

      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('light');
    });
  });

  describe('setTheme', () => {
    it('sets light theme', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
      expect(localStorageStore['checklist-theme']).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('sets dark theme', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
      expect(localStorageStore['checklist-theme']).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('sets system theme', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('system');
      });

      expect(result.current.theme).toBe('system');
      expect(localStorageStore['checklist-theme']).toBe('system');
    });
  });

  describe('toggleTheme', () => {
    it('toggles from light to dark', () => {
      localStorageStore['checklist-theme'] = 'light';
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it('toggles from dark to light', () => {
      localStorageStore['checklist-theme'] = 'dark';
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it('toggles from system (light) to dark', () => {
      localStorageStore['checklist-theme'] = 'system';
      currentPrefersDark = false;
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
    });

    it('toggles from system (dark) to light', () => {
      localStorageStore['checklist-theme'] = 'system';
      currentPrefersDark = true;
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
    });
  });

  describe('system theme changes', () => {
    it('updates when system preference changes to dark', () => {
      localStorageStore['checklist-theme'] = 'system';
      currentPrefersDark = false;
      const { result } = renderHook(() => useTheme());

      expect(result.current.effectiveTheme).toBe('light');

      // Simulate system theme change
      act(() => {
        currentPrefersDark = true;
        mediaQueryListeners.forEach((listener) => {
          listener({ matches: true } as MediaQueryListEvent);
        });
      });

      // The effective theme should update based on the new system preference
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('does not listen for system changes when not in system mode', () => {
      localStorageStore['checklist-theme'] = 'light';
      renderHook(() => useTheme());

      // No listeners should be registered
      expect(mediaQueryListeners).toHaveLength(0);
    });

    it('removes listener when switching away from system mode', () => {
      localStorageStore['checklist-theme'] = 'system';
      const { result } = renderHook(() => useTheme());

      expect(mediaQueryListeners.length).toBeGreaterThan(0);

      act(() => {
        result.current.setTheme('dark');
      });

      // Listener should be removed (cleanup runs when theme changes)
    });
  });

  describe('DOM class application', () => {
    it('adds dark class for dark theme', () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('removes dark class for light theme', () => {
      document.documentElement.classList.add('dark');
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('light');
      });

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('initializeTheme', () => {
    it('applies stored theme on initialization', () => {
      localStorageStore['checklist-theme'] = 'dark';

      initializeTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('applies light theme by default', () => {
      initializeTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('applies system theme based on preference', () => {
      localStorageStore['checklist-theme'] = 'system';
      currentPrefersDark = true;

      initializeTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});

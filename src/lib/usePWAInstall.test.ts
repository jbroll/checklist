/**
 * Unit tests for PWA installation hook
 *
 * Tests PWA installation state detection and prompt handling.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePWAInstall } from './usePWAInstall';

describe('usePWAInstall', () => {
  let originalNavigator: Navigator;
  let _originalWindow: Window & typeof globalThis;
  let eventListeners: Record<string, ((e: Event) => void)[]>;
  let mediaQueryListeners: ((e: MediaQueryListEvent) => void)[];

  const mockMatchMedia = (matches: boolean) => {
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    mediaQueryListeners = listeners;

    return {
      matches,
      addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          listeners.push(handler);
        }
      }),
      removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          const index = listeners.indexOf(handler);
          if (index > -1) listeners.splice(index, 1);
        }
      }),
    };
  };

  beforeEach(() => {
    originalNavigator = window.navigator;
    eventListeners = {};

    // Mock matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation(() => mockMatchMedia(false) as any);

    // Mock addEventListener/removeEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation((event: string, handler: any) => {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(handler);
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((event: string, handler: any) => {
      if (eventListeners[event]) {
        const index = eventListeners[event].indexOf(handler);
        if (index > -1) {
          eventListeners[event].splice(index, 1);
        }
      }
    });

    // Mock navigator
    Object.defineProperty(window, 'navigator', {
      value: {
        userAgent: 'Chrome',
        platform: 'Win32',
        maxTouchPoints: 0,
        standalone: undefined,
      },
      writable: true,
      configurable: true,
    });

    // Mock document.referrer
    Object.defineProperty(document, 'referrer', {
      value: '',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('returns showInstallOption true when not installed', () => {
      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.showInstallOption).toBe(true);
      expect(result.current.isInstalled).toBe(false);
    });

    it('returns hasNativePrompt false initially', () => {
      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.hasNativePrompt).toBe(false);
    });

    it('includes platformInfo', () => {
      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.platformInfo).toBeDefined();
      expect(result.current.platformInfo.platform).toBeDefined();
      expect(result.current.platformInfo.browser).toBeDefined();
    });
  });

  describe('standalone detection', () => {
    it('detects standalone mode via matchMedia', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation(() => mockMatchMedia(true) as any);

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isInstalled).toBe(true);
      expect(result.current.showInstallOption).toBe(false);
    });

    it('detects iOS standalone mode via navigator.standalone', () => {
      Object.defineProperty(window, 'navigator', {
        value: {
          userAgent: 'iPhone',
          platform: 'MacIntel',
          maxTouchPoints: 5,
          standalone: true,
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isInstalled).toBe(true);
    });

    it('detects TWA via document.referrer', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'android-app://com.example.app',
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isInstalled).toBe(true);
    });
  });

  describe('beforeinstallprompt event', () => {
    it('captures beforeinstallprompt event', () => {
      const { result } = renderHook(() => usePWAInstall());

      // Initially no prompt
      expect(result.current.hasNativePrompt).toBe(false);

      // Simulate beforeinstallprompt event
      const mockEvent = {
        preventDefault: vi.fn(),
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
        prompt: vi.fn().mockResolvedValue(undefined),
      };

      act(() => {
        eventListeners.beforeinstallprompt?.forEach((handler) => {
          handler(mockEvent as any);
        });
      });

      expect(result.current.hasNativePrompt).toBe(true);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('triggerInstall', () => {
    it('returns false when no prompt available', async () => {
      const { result } = renderHook(() => usePWAInstall());

      let installResult: boolean | undefined;
      await act(async () => {
        installResult = await result.current.triggerInstall();
      });

      expect(installResult).toBe(false);
    });

    it('triggers prompt and returns true on acceptance', async () => {
      const { result } = renderHook(() => usePWAInstall());

      const mockEvent = {
        preventDefault: vi.fn(),
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
        prompt: vi.fn().mockResolvedValue(undefined),
      };

      act(() => {
        eventListeners.beforeinstallprompt?.forEach((handler) => {
          handler(mockEvent as any);
        });
      });

      let installResult: boolean | undefined;
      await act(async () => {
        installResult = await result.current.triggerInstall();
      });

      expect(mockEvent.prompt).toHaveBeenCalled();
      expect(installResult).toBe(true);
      // Prompt should be cleared after use
      expect(result.current.hasNativePrompt).toBe(false);
    });

    it('returns false on dismissal', async () => {
      const { result } = renderHook(() => usePWAInstall());

      const mockEvent = {
        preventDefault: vi.fn(),
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
        prompt: vi.fn().mockResolvedValue(undefined),
      };

      act(() => {
        eventListeners.beforeinstallprompt?.forEach((handler) => {
          handler(mockEvent as any);
        });
      });

      let installResult: boolean | undefined;
      await act(async () => {
        installResult = await result.current.triggerInstall();
      });

      expect(installResult).toBe(false);
    });
  });

  describe('appinstalled event', () => {
    it('updates isInstalled when app is installed', () => {
      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isInstalled).toBe(false);

      act(() => {
        eventListeners.appinstalled?.forEach((handler) => {
          handler(new Event('appinstalled'));
        });
      });

      expect(result.current.isInstalled).toBe(true);
      expect(result.current.showInstallOption).toBe(false);
    });

    it('clears install prompt when app is installed', () => {
      const { result } = renderHook(() => usePWAInstall());

      // First, capture an install prompt
      const mockEvent = {
        preventDefault: vi.fn(),
        platforms: ['web'],
        userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
        prompt: vi.fn().mockResolvedValue(undefined),
      };

      act(() => {
        eventListeners.beforeinstallprompt?.forEach((handler) => {
          handler(mockEvent as any);
        });
      });

      expect(result.current.hasNativePrompt).toBe(true);

      // Then install the app
      act(() => {
        eventListeners.appinstalled?.forEach((handler) => {
          handler(new Event('appinstalled'));
        });
      });

      expect(result.current.hasNativePrompt).toBe(false);
    });
  });

  describe('display-mode change listener', () => {
    it('updates isInstalled when display-mode changes', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation(() => mockMatchMedia(false) as any);

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isInstalled).toBe(false);

      // Simulate display-mode change
      act(() => {
        mediaQueryListeners.forEach((handler) => {
          handler({ matches: true } as MediaQueryListEvent);
        });
      });

      expect(result.current.isInstalled).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      const { unmount } = renderHook(() => usePWAInstall());

      unmount();

      expect(window.removeEventListener).toHaveBeenCalledWith(
        'beforeinstallprompt',
        expect.any(Function),
      );
      expect(window.removeEventListener).toHaveBeenCalledWith('appinstalled', expect.any(Function));
    });
  });
});

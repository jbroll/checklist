import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectPlatform } from './platformDetect';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

/**
 * Hook to manage PWA installation state and prompt.
 *
 * Returns:
 * - showInstallOption: true if "Install App" should be shown in UI (not already installed)
 * - hasNativePrompt: true if browser supports native install prompt (beforeinstallprompt fired)
 * - isInstalled: true if the app is already running as an installed PWA
 * - triggerInstall: function to trigger native install prompt (only works if hasNativePrompt)
 * - platformInfo: detected platform information for showing appropriate instructions
 */
export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const platformInfo = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    // Check if already running as installed PWA
    const checkInstalled = () => {
      // Check display-mode: standalone (works on most browsers)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

      // Check iOS Safari specific property
      const isIOSStandalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      // Check if running in TWA (Trusted Web Activity) on Android
      const isTWA = document.referrer.includes('android-app://');

      setIsInstalled(isStandalone || isIOSStandalone || isTWA);
    };

    checkInstalled();

    // Listen for display-mode changes (e.g., if user installs while app is open)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    // Capture the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Save the event for later use
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) {
      return false;
    }

    // Show the install prompt
    await installPrompt.prompt();

    // Wait for the user's choice
    const { outcome } = await installPrompt.userChoice;

    // Clear the saved prompt - it can only be used once
    setInstallPrompt(null);

    return outcome === 'accepted';
  }, [installPrompt]);

  const hasNativePrompt = installPrompt !== null;

  return {
    // Show install option if not already installed
    showInstallOption: !isInstalled,
    // Native prompt is available (beforeinstallprompt fired)
    hasNativePrompt,
    // App is already installed
    isInstalled,
    // Function to trigger native install (only works if hasNativePrompt is true)
    triggerInstall,
    // Platform info for showing appropriate instructions
    platformInfo,
  };
}

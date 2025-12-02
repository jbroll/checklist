/**
 * Platform and browser detection utilities for PWA installation guidance.
 */

export type Platform = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'unknown';

export interface PlatformInfo {
  platform: Platform;
  browser: Browser;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isSafari: boolean;
  isIOSNonSafari: boolean;
  supportsNativeInstall: boolean;
}

/**
 * Detect the current platform and browser.
 * Used to show appropriate PWA installation instructions.
 */
export function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent.toLowerCase();

  // Platform detection
  let platform: Platform = 'unknown';
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  const isMacOS = /macintosh|mac os x/.test(ua) && !isIOS;
  const isWindows = /windows/.test(ua);
  const isLinux = /linux/.test(ua) && !isAndroid;

  if (isIOS) platform = 'ios';
  else if (isAndroid) platform = 'android';
  else if (isMacOS) platform = 'macos';
  else if (isWindows) platform = 'windows';
  else if (isLinux) platform = 'linux';

  // Browser detection
  let browser: Browser = 'unknown';

  // Check Safari first (but not Chrome/Firefox on iOS which include "Safari" in UA)
  const isSafari =
    /safari/.test(ua) && !/chrome/.test(ua) && !/firefox/.test(ua) && !/edg/.test(ua);

  // Chrome (includes Edge on Chromium, but we check Edge separately)
  const isChrome = /chrome/.test(ua) && !/edg/.test(ua) && !/samsung/.test(ua);

  // Edge
  const isEdge = /edg/.test(ua);

  // Firefox
  const isFirefox = /firefox/.test(ua);

  // Samsung Internet
  const isSamsung = /samsung/.test(ua);

  if (isSafari) browser = 'safari';
  else if (isEdge) browser = 'edge';
  else if (isSamsung) browser = 'samsung';
  else if (isChrome) browser = 'chrome';
  else if (isFirefox) browser = 'firefox';

  const isMobile = isIOS || isAndroid;
  const isDesktop = !isMobile;

  // iOS non-Safari browsers can't install PWAs
  const isIOSNonSafari = isIOS && !isSafari;

  // Native install prompt is supported on:
  // - Android: Chrome, Edge, Samsung Internet
  // - Desktop: Chrome, Edge
  // NOT supported on: iOS (any), Firefox (any), Safari (any)
  const supportsNativeInstall =
    !isIOS && !isSafari && !isFirefox && (isChrome || isEdge || isSamsung);

  return {
    platform,
    browser,
    isIOS,
    isAndroid,
    isMobile,
    isDesktop,
    isSafari,
    isIOSNonSafari,
    supportsNativeInstall,
  };
}

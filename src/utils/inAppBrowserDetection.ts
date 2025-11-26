/**
 * In-App Browser Detection
 *
 * Detects when the user is viewing the app in a restricted WebView environment
 * (Facebook, Instagram, TikTok, etc.) that doesn't support OAuth properly.
 */

export interface InAppBrowserInfo {
  isInAppBrowser: boolean;
  browserName: string | null;
  openInBrowserInstructions: string | null;
}

/**
 * Detect if the current browser is an in-app WebView
 */
export function detectInAppBrowser(): InAppBrowserInfo {
  const ua = navigator.userAgent || navigator.vendor || '';

  // Facebook in-app browser
  if (ua.includes('FBAN') || ua.includes('FBAV') || ua.includes('FB_IAB')) {
    return {
      isInAppBrowser: true,
      browserName: 'Facebook',
      openInBrowserInstructions:
        'Tap the three dots (•••) in the top right corner, then select "Open in Browser" or "Open in Safari/Chrome".',
    };
  }

  // Instagram in-app browser
  if (ua.includes('Instagram')) {
    return {
      isInAppBrowser: true,
      browserName: 'Instagram',
      openInBrowserInstructions:
        'Tap the three dots (•••) in the top right corner, then select "Open in Browser" or "Open in Safari/Chrome".',
    };
  }

  // TikTok in-app browser
  if (ua.includes('TikTok') || ua.includes('BytedanceWebview') || ua.includes('musical_ly')) {
    return {
      isInAppBrowser: true,
      browserName: 'TikTok',
      openInBrowserInstructions:
        'Tap the three dots (•••) or share icon, then select "Open in Browser" or copy the link and paste it in Safari/Chrome.',
    };
  }

  // Twitter/X in-app browser
  if (ua.includes('Twitter') || ua.includes('TwitterAndroid')) {
    return {
      isInAppBrowser: true,
      browserName: 'Twitter/X',
      openInBrowserInstructions: 'Tap the three dots (•••) menu, then select "Open in browser".',
    };
  }

  // LinkedIn in-app browser
  if (ua.includes('LinkedInApp')) {
    return {
      isInAppBrowser: true,
      browserName: 'LinkedIn',
      openInBrowserInstructions:
        'Tap the three dots (•••) in the top right corner, then select "Open in Browser".',
    };
  }

  // Snapchat in-app browser
  if (ua.includes('Snapchat')) {
    return {
      isInAppBrowser: true,
      browserName: 'Snapchat',
      openInBrowserInstructions:
        'Long-press the link and select "Open in Browser", or copy the link and paste it in Safari/Chrome.',
    };
  }

  // Facebook Messenger
  if (ua.includes('Messenger') || ua.includes('FBMS')) {
    return {
      isInAppBrowser: true,
      browserName: 'Messenger',
      openInBrowserInstructions:
        'Tap the three dots (•••) or the Safari/Chrome icon at the bottom to open in your browser.',
    };
  }

  // WhatsApp in-app browser (less common, but exists)
  if (ua.includes('WhatsApp')) {
    return {
      isInAppBrowser: true,
      browserName: 'WhatsApp',
      openInBrowserInstructions:
        'Copy the link and paste it in Safari/Chrome, or tap "Open in Safari/Chrome" if available.',
    };
  }

  // Pinterest in-app browser
  if (ua.includes('Pinterest')) {
    return {
      isInAppBrowser: true,
      browserName: 'Pinterest',
      openInBrowserInstructions: 'Tap the three dots (•••) menu, then select "Open in browser".',
    };
  }

  // Slack in-app browser
  if (ua.includes('Slack')) {
    return {
      isInAppBrowser: true,
      browserName: 'Slack',
      openInBrowserInstructions:
        'Tap "Open in Browser" at the top of the screen, or copy the link and paste it in Safari/Chrome.',
    };
  }

  // Discord in-app browser
  if (ua.includes('Discord')) {
    return {
      isInAppBrowser: true,
      browserName: 'Discord',
      openInBrowserInstructions: 'Copy the link and paste it in Safari/Chrome.',
    };
  }

  // Line in-app browser
  if (ua.includes('Line/')) {
    return {
      isInAppBrowser: true,
      browserName: 'LINE',
      openInBrowserInstructions: 'Tap the menu icon, then select "Open in external browser".',
    };
  }

  // WeChat in-app browser
  if (ua.includes('MicroMessenger')) {
    return {
      isInAppBrowser: true,
      browserName: 'WeChat',
      openInBrowserInstructions:
        'Tap the three dots (•••) in the top right corner, then select "Open in Browser".',
    };
  }

  // Generic WebView detection (fallback)
  // This catches some edge cases but may have false positives
  const isGenericWebView =
    // Android WebView
    (ua.includes('wv') && ua.includes('Android')) ||
    // iOS WebView indicators
    (ua.includes('iPhone') && !ua.includes('Safari')) ||
    (ua.includes('iPad') && !ua.includes('Safari'));

  if (isGenericWebView) {
    return {
      isInAppBrowser: true,
      browserName: null, // Unknown app
      openInBrowserInstructions:
        'Look for a menu option (often three dots •••) to "Open in Browser" or "Open in Safari/Chrome". You can also copy the link and paste it in your browser.',
    };
  }

  return {
    isInAppBrowser: false,
    browserName: null,
    openInBrowserInstructions: null,
  };
}

/**
 * Get the current page URL for copying
 */
export function getCurrentUrl(): string {
  return window.location.href;
}

/**
 * Attempt to copy text to clipboard
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers or restricted contexts
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch {
    return false;
  }
}

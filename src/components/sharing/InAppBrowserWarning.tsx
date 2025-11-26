/**
 * In-App Browser Warning Component
 *
 * Displays a warning when the user is viewing the app in a restricted WebView
 * (Facebook, Instagram, TikTok, etc.) that doesn't support OAuth properly.
 */

import { AlertTriangle, Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  copyToClipboard,
  detectInAppBrowser,
  getCurrentUrl,
  type InAppBrowserInfo,
} from '@/utils/inAppBrowserDetection';

interface InAppBrowserWarningProps {
  /** Called when user should proceed (not in WebView) */
  onContinue: () => void;
}

export function InAppBrowserWarning({ onContinue }: InAppBrowserWarningProps) {
  const [browserInfo] = useState<InAppBrowserInfo>(() => detectInAppBrowser());
  const [copied, setCopied] = useState(false);

  // If not in an in-app browser, call onContinue and render nothing
  if (!browserInfo.isInAppBrowser) {
    // Use effect-like pattern to call onContinue
    // This is safe because we're in a conditional that won't change
    onContinue();
    return null;
  }

  const handleCopyLink = async () => {
    const url = getCurrentUrl();
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const browserName = browserInfo.browserName || 'this app';

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-amber-100 p-3">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
          </div>

          <h1 className="mb-2 text-center text-2xl font-bold text-neutral-900">Open in Browser</h1>

          <p className="mb-4 text-center text-neutral-600">
            You're viewing this page in <span className="font-medium">{browserName}</span>'s
            built-in browser, which doesn't support sign-in properly.
          </p>

          <div className="mb-6 rounded-lg bg-white p-4 border border-amber-200">
            <div className="flex items-start gap-3">
              <ExternalLink className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-neutral-700">
                <p className="font-medium mb-1">How to open in your browser:</p>
                <p>{browserInfo.openInBrowserInstructions}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={handleCopyLink}
              variant={copied ? 'primary' : 'outline'}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </>
              )}
            </Button>

            <p className="text-center text-xs text-neutral-500">
              Copy this link and paste it in Safari, Chrome, or your preferred browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check if we're in an in-app browser
 */
export function useInAppBrowserDetection(): InAppBrowserInfo {
  const [browserInfo] = useState<InAppBrowserInfo>(() => detectInAppBrowser());
  return browserInfo;
}

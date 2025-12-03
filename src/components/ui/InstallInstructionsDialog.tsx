import { Check, Copy, MonitorDown } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { detectPlatform, type PlatformInfo } from '@/lib/platformDetect';

interface InstallInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Platform-specific PWA installation instructions dialog.
 * Shows appropriate instructions based on the user's device and browser.
 */
export function InstallInstructionsDialog({ open, onOpenChange }: InstallInstructionsDialogProps) {
  const [copied, setCopied] = useState(false);
  const platformInfo = detectPlatform();

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.origin;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Install BubbleList</DialogTitle>
          <DialogDescription>
            Install BubbleList on your device for the best experience with offline support.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <InstructionsContent
            platformInfo={platformInfo}
            onCopyLink={handleCopyLink}
            copied={copied}
          />
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="primary">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface InstructionsContentProps {
  platformInfo: PlatformInfo;
  onCopyLink: () => void;
  copied: boolean;
}

function InstructionsContent({ platformInfo, onCopyLink, copied }: InstructionsContentProps) {
  const { isIOS, isAndroid, isSafari, isIOSNonSafari, platform, browser } = platformInfo;

  // iOS with non-Safari browser - need to open in Safari first
  if (isIOSNonSafari) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            Safari is required to install apps on iOS
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-content-secondary">Step 1: Copy this link</p>
          <Button onClick={onCopyLink} variant="outline" className="w-full justify-center gap-2">
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Link
              </>
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-content-secondary">
            Step 2: Open Safari and paste the link
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-content-secondary">Step 3: In Safari</p>
          <ol className="list-decimal list-inside text-sm text-content-secondary space-y-1 pl-2">
            <li>
              Tap the Share button <ShareIcon />
            </li>
            <li>Scroll down and tap "Add to Home Screen"</li>
            <li>Tap "Add" to confirm</li>
          </ol>
        </div>
      </div>
    );
  }

  // iOS Safari - direct Add to Home Screen
  if (isIOS && isSafari) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal list-inside text-sm text-content-secondary space-y-2 pl-2">
          <li>
            Tap the Share button <ShareIcon /> at the bottom of Safari
          </li>
          <li>Scroll down and tap "Add to Home Screen"</li>
          <li>Tap "Add" in the top right to confirm</li>
        </ol>
        <p className="text-xs text-content-tertiary">
          The app will appear on your home screen and work offline.
        </p>
      </div>
    );
  }

  // Android (Firefox or other non-Chromium)
  if (isAndroid && !platformInfo.supportsNativeInstall) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            For the best experience, use Chrome or Edge on Android.
          </p>
        </div>
        <p className="text-sm text-content-secondary">
          In {getBrowserName(browser)}, look for "Install app" or "Add to Home screen" in the
          browser menu (three dots).
        </p>
      </div>
    );
  }

  // macOS Safari
  if (platform === 'macos' && isSafari) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal list-inside text-sm text-content-secondary space-y-2 pl-2">
          <li>Click the Share button in the Safari toolbar</li>
          <li>Click "Add to Dock"</li>
        </ol>
        <p className="text-xs text-content-tertiary">
          The app will appear in your Dock and work like a native app.
        </p>
      </div>
    );
  }

  // Desktop Firefox
  if (browser === 'firefox') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Firefox has limited PWA support on desktop.
          </p>
        </div>
        <p className="text-sm text-content-secondary">
          For the best experience, open BubbleList in Chrome or Edge, then click the install icon in
          the address bar.
        </p>
        <Button onClick={onCopyLink} variant="outline" className="w-full justify-center gap-2">
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Link
            </>
          )}
        </Button>
      </div>
    );
  }

  // Desktop Chrome/Edge - should have native install, but fallback instructions
  if (platformInfo.supportsNativeInstall) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="text-sm text-content-secondary">
              Look for the install icon in your browser's address bar (right side), or check the
              browser menu.
            </p>
            <p className="text-xs text-content-tertiary mt-2">
              If you don't see an install option, the app may already be installed.
            </p>
          </div>
          <div className="flex-shrink-0 p-3 bg-surface-tertiary rounded-lg border border-divider-primary">
            <MonitorDown className="h-10 w-10 text-content-secondary" />
          </div>
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">
        Look for "Install", "Add to Home Screen", or similar option in your browser's menu.
      </p>
      <p className="text-xs text-content-tertiary">
        Different browsers have different ways to install web apps. Check your browser's menu
        (usually three dots or lines).
      </p>
    </div>
  );
}

/** iOS Share icon representation */
function ShareIcon() {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 mx-1 border border-divider-tertiary rounded text-xs align-middle">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-label="Share"
        role="img"
      >
        <path d="M12 2v13M5 9l7-7 7 7M5 19h14" />
      </svg>
    </span>
  );
}

function getBrowserName(browser: string): string {
  const names: Record<string, string> = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    safari: 'Safari',
    edge: 'Edge',
    samsung: 'Samsung Internet',
    unknown: 'your browser',
  };
  return names[browser] || 'your browser';
}

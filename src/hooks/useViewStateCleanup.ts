/**
 * useViewStateCleanup Hook
 *
 * Runs viewState garbage collection in the background after app startup.
 * Uses requestIdleCallback to avoid blocking the UI.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { useEffect, useRef } from 'react';
import type { Account } from '../schemas';
import * as viewStateService from '../services/viewStateService';

/**
 * Collect all valid IDs from the account's folder tree
 */
function collectValidIds(account: InstanceOfSchema<typeof Account>): {
  folderIds: Set<string>;
  templateIds: Set<string>;
  sessionIds: Set<string>;
} {
  const folderIds = new Set<string>();
  const templateIds = new Set<string>();
  const sessionIds = new Set<string>();

  if (!account.root?.folders) {
    return { folderIds, templateIds, sessionIds };
  }

  function traverseFolders(folders: Iterable<unknown>) {
    for (const folder of folders) {
      if (!folder || typeof folder !== 'object') continue;

      const f = folder as {
        $jazz?: { id?: string };
        children?: Iterable<unknown>;
        items?: Array<{ id: string }>;
        sessions?: Array<{ id: string }>;
      };

      // Add folder ID
      if (f.$jazz?.id) {
        folderIds.add(f.$jazz.id);

        // If it's a template folder, add template ID (same as folder ID)
        if (f.items !== undefined) {
          templateIds.add(f.$jazz.id);

          // Add all session IDs
          if (f.sessions) {
            for (const session of f.sessions) {
              if (session?.id) {
                sessionIds.add(session.id);
              }
            }
          }
        }

        // Recurse into children
        if (f.children) {
          traverseFolders(f.children);
        }
      }
    }
  }

  traverseFolders(account.root.folders);
  return { folderIds, templateIds, sessionIds };
}

/**
 * Hook to run viewState cleanup in the background
 *
 * @param account - The user's account (or undefined if not loaded)
 */
export function useViewStateCleanup(account: InstanceOfSchema<typeof Account> | undefined): void {
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run once per mount, and only when account is loaded
    if (!account?.root?.viewState || hasRunRef.current) {
      return;
    }

    hasRunRef.current = true;

    const runCleanup = () => {
      try {
        const { folderIds, templateIds, sessionIds } = collectValidIds(account);

        const result = viewStateService.cleanupViewState(
          account,
          folderIds,
          templateIds,
          sessionIds,
        );

        const totalRemoved =
          result.foldersRemoved + result.templatesRemoved + result.sessionsRemoved;

        if (totalRemoved > 0) {
          console.log(`[ViewState Cleanup] Removed ${totalRemoved} stale entries:`, result);
        }
      } catch (error) {
        // Don't crash the app if cleanup fails
        console.error('[ViewState Cleanup] Error during cleanup:', error);
      }
    };

    // Run cleanup when browser is idle, not during startup
    if ('requestIdleCallback' in window) {
      const handle = requestIdleCallback(runCleanup, { timeout: 30000 });
      return () => cancelIdleCallback(handle);
    } else {
      // Fallback for Safari: use setTimeout with delay
      const handle = setTimeout(runCleanup, 5000);
      return () => clearTimeout(handle);
    }
  }, [account]);
}

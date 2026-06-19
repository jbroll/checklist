import { AuthProvider } from 'jazz-tools/better-auth/auth/react';
import type { ReactNode } from 'react';
import { JazzReactProvider, useAccount } from '@/jazz';
import { Account } from '../schema';
import { betterAuthClient } from './auth-client';

// Jazz API key is intentionally public (like Firebase) - it identifies the project
// but doesn't grant data access. Jazz uses end-to-end encryption with user keys.
const apiKey = import.meta.env.VITE_JAZZ_API_KEY;
const jazzPeer = import.meta.env.VITE_JAZZ_PEER || 'wss://cloud.jazz.tools';

export function JazzProvider({ children }: { children: ReactNode }) {
  // Append API key to sync server URL if provided
  const syncPeer = apiKey ? `${jazzPeer}/?key=${apiKey}` : jazzPeer;

  return (
    <JazzReactProvider
      sync={{
        peer: syncPeer,
        // Always sync to enable local mode (anonymous accounts)
        when: 'always',
      }}
      AccountSchema={Account}
      onAnonymousAccountDiscarded={async (anonymousAccount) => {
        // When user logs in with existing account on a new device,
        // this handler migrates data from the temporary anonymous account
        // to the authenticated account retrieved from BetterAuth

        if (import.meta.env.DEV)
          console.log('[Jazz] Anonymous account discarded - migrating data if needed');

        try {
          // Load the anonymous account's root data
          const anonymousData = await anonymousAccount.$jazz.ensureLoaded({
            resolve: { root: { folders: true } },
          });

          // Check if anonymous account has any data
          const hasAnonymousData =
            anonymousData.root?.folders && anonymousData.root.folders.length > 0;

          if (import.meta.env.DEV) {
            if (hasAnonymousData) {
              console.log(
                '[Jazz] Anonymous account has data - will be available for migration:',
                anonymousData.root.folders.length,
                'folders',
              );
            } else {
              console.log(
                '[Jazz] No data in anonymous account - authenticated account will load from server',
              );
            }
          }
        } catch (error) {
          if (import.meta.env.DEV)
            console.error('[Jazz] Error during account migration check:', error);
          // Don't throw - allow login to continue even if migration fails
        }
      }}
    >
      <AuthProvider betterAuthClient={betterAuthClient}>{children}</AuthProvider>
    </JazzReactProvider>
  );
}

// Re-export hooks through the jazz narrow-waist
export {
  useAcceptInvite,
  useAccount,
  useCoState,
  useIsAuthenticated,
  useLogOut,
} from '@/jazz';

/**
 * Typed wrapper for useAccount that returns our Account schema type
 * This provides proper typing for account.root and other custom fields
 */
export function useTypedAccount(): ReturnType<typeof useAccount<typeof Account>> {
  const account = useAccount<typeof Account>();
  return account;
}

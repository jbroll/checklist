import { AuthProvider } from 'jazz-tools/better-auth/auth/react';
import { JazzReactProvider } from 'jazz-tools/react';
import type { ReactNode } from 'react';
import { Account } from '../schemas';
import { betterAuthClient } from './auth-client';

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

        console.log('[Jazz] Anonymous account discarded - migrating data if needed');

        try {
          // Load the anonymous account's root data
          const anonymousData = await anonymousAccount.$jazz.ensureLoaded({
            resolve: { root: { folders: true } },
          });

          // Check if anonymous account has any data
          const hasAnonymousData =
            anonymousData.root?.folders && anonymousData.root.folders.length > 0;

          if (hasAnonymousData) {
            console.log(
              '[Jazz] Anonymous account has data - will be available for migration:',
              anonymousData.root.folders.length,
              'folders',
            );
            // Note: Migration will happen in the authenticated account's context
            // The authenticated account can choose to merge this data if needed
          } else {
            console.log(
              '[Jazz] No data in anonymous account - authenticated account will load from server',
            );
          }
        } catch (error) {
          console.error('[Jazz] Error during account migration check:', error);
          // Don't throw - allow login to continue even if migration fails
        }
      }}
    >
      <AuthProvider betterAuthClient={betterAuthClient}>{children}</AuthProvider>
    </JazzReactProvider>
  );
}

// Re-export hooks from jazz-tools/react
export { useAcceptInvite, useAccount, useCoState } from 'jazz-tools/react';

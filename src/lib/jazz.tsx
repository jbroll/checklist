import { AuthProvider } from 'jazz-tools/better-auth/auth/react';
import { JazzReactProvider } from 'jazz-tools/react';
import type { ReactNode } from 'react';
import { GroceriesAccount } from '../schemas';
import { betterAuthClient } from './auth-client';

const apiKey = import.meta.env.VITE_JAZZ_API_KEY;

export function JazzProvider({ children }: { children: ReactNode }) {
  return (
    <JazzReactProvider
      sync={{
        peer: import.meta.env.VITE_JAZZ_PEER || `wss://cloud.jazz.tools/?key=${apiKey}`,
      }}
      AccountSchema={GroceriesAccount}
    >
      <AuthProvider betterAuthClient={betterAuthClient}>{children}</AuthProvider>
    </JazzReactProvider>
  );
}

// Re-export hooks from jazz-tools/react
export { useAcceptInvite, useAccount, useCoState } from 'jazz-tools/react';

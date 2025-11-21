import { createAuthClient } from 'better-auth/client';
import { jazzPluginClient } from 'jazz-tools/better-auth/auth/client';

// Get auth URL from environment variable
const authURL = import.meta.env.VITE_AUTH_URL || '';
const baseURL = authURL ? `${authURL}/api/auth` : '';

// Debug: Log what's embedded at build time
if (import.meta.env.DEV) {
  console.log('[auth-client] Development mode - using Vite proxy');
} else {
  console.log('[auth-client] Production mode:', {
    authURL,
    baseURL,
    MODE: import.meta.env.MODE,
  });
}

export const betterAuthClient = createAuthClient({
  baseURL,
  plugins: [jazzPluginClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

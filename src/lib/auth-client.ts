import { createAuthClient } from 'better-auth/client';
import { jazzPluginClient } from 'jazz-tools/better-auth/auth/client';

// Get auth URL from environment variable
const authURL = import.meta.env.VITE_AUTH_URL || '';
const baseURL = authURL ? `${authURL}/api/auth` : '';

export const betterAuthClient = createAuthClient({
  baseURL,
  plugins: [jazzPluginClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

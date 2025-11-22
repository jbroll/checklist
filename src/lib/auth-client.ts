import { createAuthClient } from 'better-auth/client';
import { jazzPluginClient } from 'jazz-tools/better-auth/auth/client';

// Get auth URL from environment variable
const authURL = import.meta.env.VITE_AUTH_URL;
// In development, use localhost (proxied by Vite to backend:3001)
// In production, use full production URL
const baseURL = authURL ? `${authURL}/api/auth` : `${window.location.origin}/api/auth`;

export const betterAuthClient = createAuthClient({
  baseURL,
  plugins: [jazzPluginClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

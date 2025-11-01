import { createAuthClient } from 'better-auth/client';
import { jazzPluginClient } from 'jazz-tools/better-auth/auth/client';

export const betterAuthClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL || 'http://localhost:3001',
  plugins: [jazzPluginClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

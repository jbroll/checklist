import { createAuthClient } from 'better-auth/client';
import { jazzPluginClient } from 'jazz-tools/better-auth/auth/client';

export const betterAuthClient = createAuthClient({
  // Use relative URL to leverage Vite proxy (same-origin)
  baseURL: import.meta.env.VITE_AUTH_URL || 'http://localhost:5173',
  plugins: [jazzPluginClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

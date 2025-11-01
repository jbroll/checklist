import { createAuthClient } from 'better-auth/client';
import { jazzPluginClient } from 'jazz-tools/better-auth/auth/client';

export const betterAuthClient = createAuthClient({
  // Use empty string to make requests relative, so Vite proxy handles routing
  baseURL: '',
  plugins: [jazzPluginClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

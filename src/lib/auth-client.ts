import { createBetterAuthClient } from '@jbroll/rowboat-auth-betterauth-react';

// Base auth URL from environment; the rowboat client appends `/api/auth` and
// falls back to `window.location.origin` when unset (dev is proxied by Vite).
export const betterAuthClient = createBetterAuthClient(import.meta.env.VITE_AUTH_URL);

import { createBetterAuthClient } from '@jbr-jazz/hierarchy-client';

// Base auth URL from environment; the shared client appends `/api/auth` and
// falls back to `window.location.origin` when unset (dev is proxied by Vite).
export const betterAuthClient = createBetterAuthClient(import.meta.env.VITE_AUTH_URL);

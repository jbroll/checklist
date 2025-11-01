/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_JAZZ_SYNC_SERVER?: string;
  readonly VITE_JAZZ_API_KEY?: string;
  readonly VITE_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

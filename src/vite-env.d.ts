/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_URL?: string;
  readonly VITE_ROWBOAT_SYNC_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import type { ServerConfig } from '../../src/index.js';

export interface Target {
  config: ServerConfig;
  syncBase: string;
}

function required(env: Record<string, string | undefined>, name: string, envPath: string): string {
  const value = env[name];
  if (!value) throw new Error(`missing ${name} in ${envPath}`);
  return value;
}

// Builds a ServerConfig for the migration target from a standalone env file (not process.env) so
// the CLI can point at a different deploy's secrets without touching this process's environment.
export function loadTarget(envPath: string, dbPath: string): Target {
  const env = dotenv.parse(readFileSync(envPath));

  const authSecret = required(env, 'BETTER_AUTH_SECRET', envPath);
  const frontendUrl = required(env, 'FRONTEND_URL', envPath);
  const rowboatDatabaseId = required(env, 'ROWBOAT_DATABASE_ID', envPath);
  const rowboatUrl = required(env, 'ROWBOAT_URL', envPath);

  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    dbPath,
    frontendUrl,
    baseUrl: frontendUrl,
    authSecret,
    appName: 'CheckList',
    trustedOrigins: [frontendUrl],
    providers: [],
    rowboatDatabaseId,
    rowboatUrl,
    rowboatAgentId: 'agent:checklist',
    emailAuth: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
  };

  return { config, syncBase: `${rowboatUrl}/db/${rowboatDatabaseId}/api/sync` };
}

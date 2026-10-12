import type { Server } from 'node:http';
import type { ShareRoutes } from '@jbroll/rowboat-sharing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type RowboatServer } from '../index.js';

const retries = vi.hoisted(() => ({
  calls: 0,
  next: (): Promise<void> => Promise.resolve(),
}));

vi.mock('@jbroll/rowboat-sharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jbroll/rowboat-sharing')>();
  return {
    ...actual,
    mountShareRoutes: (...args: Parameters<typeof actual.mountShareRoutes>): ShareRoutes => {
      actual.mountShareRoutes(...args);
      return {
        retryPendingRevokes: () => {
          retries.calls++;
          return retries.next();
        },
      };
    },
  };
});

const MINUTE = 60_000;

let server: RowboatServer;
let http: Server;

beforeEach(async () => {
  retries.calls = 0;
  retries.next = () => Promise.resolve();
  server = await createServer({
    port: 0,
    host: '127.0.0.1',
    dbPath: ':memory:',
    frontendUrl: 'http://localhost:5173',
    baseUrl: 'http://localhost:5173',
    authSecret: 'test-secret-test-secret-test-secret',
    appName: 'CheckList Test',
    trustedOrigins: ['http://localhost:5173'],
    providers: [],
    rowboatDatabaseId: 'db_test_tenant',
    rowboatUrl: 'http://rowboat.test',
    rowboatAgentId: 'agent:test',
    emailAuth: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(async () => {
  vi.useRealTimers();
  if (http.listening) await new Promise((resolve) => http.close(resolve));
  server.db.close();
});

async function start(): Promise<void> {
  http = server.start();
  await new Promise((resolve) => http.once('listening', resolve));
}

describe('owed invite undos', () => {
  it('are retried at start, then a minute after each try settles', async () => {
    await start();
    expect(retries.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(retries.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(retries.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(retries.calls).toBe(3);
  });

  it('wait for a hung try before the next one starts', async () => {
    let settle = () => {};
    retries.next = () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      });
    await start();

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(retries.calls).toBe(1);

    retries.next = () => Promise.resolve();
    settle();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(retries.calls).toBe(2);
  });

  it('keep being retried after a try rejects, which is logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('database is locked');
    retries.next = () => Promise.reject(failure);
    await start();

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(retries.calls).toBe(2);
    expect(error).toHaveBeenCalledWith('[sharing] retrying owed invite undos failed:', failure);
    error.mockRestore();
  });

  it('stop being retried once the server closes', async () => {
    await start();
    await new Promise((resolve) => http.close(resolve));

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(retries.calls).toBe(1);
  });
});

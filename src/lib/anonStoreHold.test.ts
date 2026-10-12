import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { holdAnonStore, releaseAnonStore } from './anonStoreHold';

interface Request {
  name: string;
  mode: LockMode | undefined;
  grant: () => void;
  released: boolean;
}

// A LockManager whose grants the test hands out by hand.
function fakeLocks() {
  const requests: Request[] = [];
  const locks = {
    request(name: string, options: LockOptions, callback: () => Promise<void>) {
      return new Promise<void>((done) => {
        const entry: Request = {
          name,
          mode: options.mode,
          released: false,
          grant: () => {
            void callback().then(() => {
              entry.released = true;
              done();
            });
          },
        };
        requests.push(entry);
      });
    },
  };
  return { locks, requests };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
let original: PropertyDescriptor | undefined;

function setLocks(value: unknown) {
  Object.defineProperty(navigator, 'locks', { value, configurable: true });
}

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(navigator, 'locks');
});

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'locks', original);
  else Reflect.deleteProperty(navigator, 'locks');
});

describe('holdAnonStore', () => {
  it('asks for the store lock shared, once per store, and resolves when it is granted', async () => {
    const fake = fakeLocks();
    setLocks(fake.locks);
    let granted = false;
    const first = holdAnonStore('app::anon').then(() => {
      granted = true;
    });
    const second = holdAnonStore('app::anon');

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ name: 'app::anon', mode: 'shared' });
    await flush();
    expect(granted).toBe(false);

    fake.requests[0].grant();
    await Promise.all([first, second]);
    expect(granted).toBe(true);
    releaseAnonStore('app::anon');
  });

  it('keeps the lock until the store is released', async () => {
    const fake = fakeLocks();
    setLocks(fake.locks);
    const held = holdAnonStore('app::anon');
    fake.requests[0].grant();
    await held;
    await flush();
    expect(fake.requests[0].released).toBe(false);

    releaseAnonStore('app::anon');
    await flush();
    expect(fake.requests[0].released).toBe(true);
  });

  it('gives the lock back at once when the store was released before the grant', async () => {
    const fake = fakeLocks();
    setLocks(fake.locks);
    void holdAnonStore('app::anon');
    releaseAnonStore('app::anon');

    fake.requests[0].grant();
    await flush();
    expect(fake.requests[0].released).toBe(true);
  });

  it('asks again after a release', async () => {
    const fake = fakeLocks();
    setLocks(fake.locks);
    void holdAnonStore('app::anon');
    releaseAnonStore('app::anon');
    void holdAnonStore('app::anon');

    expect(fake.requests).toHaveLength(2);
    releaseAnonStore('app::anon');
  });

  it('refuses to open the store without the Web Locks API', () => {
    setLocks(undefined);
    expect(() => holdAnonStore('app::anon')).toThrow(/navigator\.locks/);
  });

  it('refuses to release a store it does not hold', () => {
    expect(() => releaseAnonStore('app::nothing')).toThrow(/app::nothing/);
  });
});

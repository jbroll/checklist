// The anonymous store opens only under a shared Web Lock named after it. A sign-in claim takes that
// lock exclusively, so no tab writes the store while the claim copies and deletes it. One hold per
// store, so StrictMode's repeated effect neither asks twice nor releases early.
interface Hold {
  granted: Promise<void>;
  release: () => void;
}

const holds = new Map<string, Hold>();

export function holdAnonStore(name: string): Promise<void> {
  const existing = holds.get(name);
  if (existing) return existing.granted;
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    throw new Error(`navigator.locks (the Web Locks API) is required to open the store ${name}`);
  }
  let release = () => {};
  const kept = new Promise<void>((resolve) => {
    release = resolve;
  });
  const granted = new Promise<void>((resolve, reject) => {
    locks
      .request(name, { mode: 'shared' }, () => {
        resolve();
        return kept;
      })
      .catch((e: unknown) => {
        if (holds.get(name)?.granted === granted) holds.delete(name);
        reject(e);
      });
  });
  holds.set(name, { granted, release });
  return granted;
}

export function releaseAnonStore(name: string): void {
  const hold = holds.get(name);
  if (!hold) throw new Error(`releaseAnonStore: no hold on the store ${name}`);
  holds.delete(name);
  hold.release();
}

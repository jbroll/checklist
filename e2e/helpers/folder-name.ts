let counter = 0;

/** Collision-safe name for folders created against the shared sync peer. */
export function uniqueFolderName(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix} ${Date.now()}-${counter}-${rand}`;
}

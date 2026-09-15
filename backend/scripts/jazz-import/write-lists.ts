import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { syncWithServer } from '@jbroll/rowboat-client';
import { decodeRow } from '@jbroll/rowboat-cli/src/column-types.js';
import { type DataSession, openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import type { UserPlan } from './map.js';
import { assertNothingPending, syncUntilComplete } from './sync-round.js';

export interface ReadBack {
  folders: number;
  items: number;
  sessions: number;
  userSettings: boolean;
}

interface ImportArgs {
  plan: UserPlan;
  syncBase: string;
  signJWT: (sub: string) => Promise<string>;
  workDir: string;
}

const manifest = compileSchema(schema).manifest;

async function openSession(
  args: ImportArgs,
  suffix: string,
): Promise<{ session: DataSession; filename: string; token: string }> {
  const token = await args.signJWT(args.plan.userId);
  const filename = join(args.workDir, `${args.plan.userId}-${suffix}.db`);
  const session = await openDataSession({
    manifest,
    filename,
    syncUrl: args.syncBase,
    author: args.plan.userId,
    token,
    appVersion: 0,
  });
  return { session, filename, token };
}

// DataSession.sync() does not expose onTiming, the only signal that a round finished, so the round
// is run directly on the session's db.
function completeSync(session: DataSession, args: ImportArgs, token: string, label: string): Promise<void> {
  return syncUntilComplete({
    label: `user ${args.plan.userId} ${label}`,
    runRound: (onComplete) =>
      syncWithServer({
        db: session.db,
        apiBase: args.syncBase,
        author: args.plan.userId,
        headers: { authorization: `Bearer ${token}` },
        appVersion: 0,
        onTiming: onComplete,
      }),
  });
}

function liveRows(session: DataSession, table: string): Record<string, unknown>[] {
  const rows = session.sqlite
    .prepare(`select * from "${table}" where coalesce("__deleted", 0) = 0`)
    .all() as Record<string, unknown>[];
  return rows.map((row) => decodeRow(manifest, table, row));
}

function countLiveElements(map: unknown): number {
  if (map === null || map === undefined) return 0;
  return Object.values(map as Record<string, { __deleted?: boolean }>).filter((el) => el.__deleted !== true)
    .length;
}

function removeReplica(filename: string): void {
  for (const path of [filename, `${filename}-wal`, `${filename}-shm`]) {
    if (existsSync(path)) rmSync(path);
  }
}

async function mintGroup(syncBase: string, token: string, parentGroup: string | undefined): Promise<string> {
  const res = await fetch(`${syncBase}/groups`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ parentGroup }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`POST /groups failed: ${res.status} ${body}`);
  const groupId = (JSON.parse(body) as { groupId?: unknown }).groupId;
  if (typeof groupId !== 'string') throw new Error(`POST /groups returned no groupId: ${body}`);
  return groupId;
}

async function writeRows(args: ImportArgs): Promise<void> {
  const { plan } = args;
  const { session, filename, token } = await openSession(args, 'write');
  try {
    await completeSync(session, args, token, 'first sync');
    const existingSettings = liveRows(session, 'user_settings').some((row) => row.id === plan.userId);
    if (liveRows(session, 'folder').length > 0 || existingSettings) {
      throw new Error(`user ${plan.userId} already has rows in this tenant`);
    }

    const groups = new Map<string, string>();
    for (const draft of plan.folders) {
      let parentGroup: string | undefined;
      if (draft.parent_id !== null) {
        parentGroup = groups.get(draft.parent_id);
        if (parentGroup === undefined) {
          throw new Error(`folder ${draft.id} has parent ${draft.parent_id} with no minted group`);
        }
      }
      const groupId = await mintGroup(args.syncBase, token, parentGroup);
      groups.set(draft.id, groupId);
      await session.db.create('folder', { ...draft, owner_group_id: groupId });
    }

    await session.db.create('user_settings', plan.userSettings);
    await completeSync(session, args, token, 'post-write sync');
    const [pendingCreates, pendingOps] = await Promise.all([
      session.db.pendingCreateEntries(),
      session.db.pendingOps(),
    ]);
    assertNothingPending(pendingCreates.length, pendingOps.length, `user ${plan.userId} post-write sync`);
  } finally {
    session.close();
    removeReplica(filename);
  }
}

async function readBack(args: ImportArgs): Promise<ReadBack> {
  const { session, filename, token } = await openSession(args, 'verify');
  try {
    await completeSync(session, args, token, 'read-back sync');
    const folders = liveRows(session, 'folder');
    return {
      folders: folders.length,
      items: folders.reduce((sum, row) => sum + countLiveElements(row.items), 0),
      sessions: folders.reduce((sum, row) => sum + countLiveElements(row.sessions), 0),
      userSettings: liveRows(session, 'user_settings').some((row) => row.id === args.plan.userId),
    };
  } finally {
    session.close();
    removeReplica(filename);
  }
}

// Writes one user's planned rows into the tenant as that user, then counts them from a fresh
// replica. openSession signs a new token each time, so a slow write cannot expire the read-back.
export async function importUserLists(args: ImportArgs): Promise<ReadBack> {
  await writeRows(args);
  return readBack(args);
}

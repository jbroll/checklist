import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { syncWithServer } from '@jbroll/rowboat-client';
import { decodeRow } from '@jbroll/rowboat-cli/src/column-types.js';
import { type DataSession, openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { SCHEMA_VERSION } from '../../../shared/schemaVersion.js';
import type { UserPlan } from './map.js';
import { assertNothingPending, syncUntilComplete } from './sync-round.js';

export interface ReadBack {
  folders: number;
  items: number;
  sessions: number;
  userSettings: boolean;
}

export interface SessionTarget {
  syncBase: string;
  signJWT: (sub: string) => Promise<string>;
  workDir: string;
}

interface ImportArgs extends SessionTarget {
  plan: UserPlan;
}

export interface ImportResult {
  readBack: ReadBack;
  groups: Map<string, string>; // folder id -> minted group id
}

const manifest = compileSchema(schema).manifest;

interface OpenSession {
  session: DataSession;
  filename: string;
  token: string;
}

async function openSession(target: SessionTarget, userId: string, suffix: string): Promise<OpenSession> {
  const token = await target.signJWT(userId);
  const filename = join(target.workDir, `${userId}-${suffix}.db`);
  const session = await openDataSession({
    manifest,
    filename,
    syncUrl: target.syncBase,
    author: userId,
    token,
    appVersion: SCHEMA_VERSION,
  });
  return { session, filename, token };
}

// DataSession.sync() does not expose onTiming, the only signal that a round finished, so the round
// is run directly on the session's db.
function completeSync(target: SessionTarget, userId: string, open: OpenSession, label: string): Promise<void> {
  return syncUntilComplete({
    label: `user ${userId} ${label}`,
    runRound: (onComplete) =>
      syncWithServer({
        db: open.session.db,
        apiBase: target.syncBase,
        author: userId,
        headers: { authorization: `Bearer ${open.token}` },
        appVersion: SCHEMA_VERSION,
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

function closeAndRemove(open: OpenSession): void {
  open.session.close();
  for (const path of [open.filename, `${open.filename}-wal`, `${open.filename}-shm`]) {
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

async function writeRows(args: ImportArgs): Promise<Map<string, string>> {
  const { plan } = args;
  const open = await openSession(args, plan.userId, 'write');
  try {
    await completeSync(args, plan.userId, open, 'first sync');
    const existingSettings = liveRows(open.session, 'user_settings').some((row) => row.id === plan.userId);
    if (liveRows(open.session, 'folder').length > 0 || existingSettings) {
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
      const groupId = await mintGroup(args.syncBase, open.token, parentGroup);
      groups.set(draft.id, groupId);
      await open.session.db.create('folder', { ...draft, owner_group_id: groupId });
    }

    await open.session.db.create('user_settings', plan.userSettings);
    await completeSync(args, plan.userId, open, 'post-write sync');
    const [pendingCreates, pendingOps] = await Promise.all([
      open.session.db.pendingCreateEntries(),
      open.session.db.pendingOps(),
    ]);
    assertNothingPending(pendingCreates.length, pendingOps.length, `user ${plan.userId} post-write sync`);
    return groups;
  } finally {
    closeAndRemove(open);
  }
}

async function readBack(args: ImportArgs): Promise<ReadBack> {
  const open = await openSession(args, args.plan.userId, 'verify');
  try {
    await completeSync(args, args.plan.userId, open, 'read-back sync');
    const folders = liveRows(open.session, 'folder');
    return {
      folders: folders.length,
      items: folders.reduce((sum, row) => sum + countLiveElements(row.items), 0),
      sessions: folders.reduce((sum, row) => sum + countLiveElements(row.sessions), 0),
      userSettings: liveRows(open.session, 'user_settings').some((row) => row.id === args.plan.userId),
    };
  } finally {
    closeAndRemove(open);
  }
}

// Writes one user's planned rows into the tenant as that user, then counts them from a fresh
// replica. openSession signs a new token each time, so a slow write cannot expire the read-back.
export async function importUserLists(args: ImportArgs): Promise<ImportResult> {
  const groups = await writeRows(args);
  return { readBack: await readBack(args), groups };
}

export async function visibleFolderIds(target: SessionTarget, userId: string): Promise<Set<string>> {
  const open = await openSession(target, userId, 'shares');
  try {
    await completeSync(target, userId, open, 'shares sync');
    return new Set(liveRows(open.session, 'folder').map((row) => String(row.id)));
  } finally {
    closeAndRemove(open);
  }
}

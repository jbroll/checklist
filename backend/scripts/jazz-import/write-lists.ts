import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { syncWithServer } from '@jbroll/rowboat-client';
import { decodeRow } from '@jbroll/rowboat-cli/src/column-types.js';
import { type DataSession, openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { SCHEMA_VERSION } from '../../../shared/schemaVersion.js';
import { type AppliedPlan, applyPlan, type TenantFolder } from './apply-plan.js';
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

export interface ImportResult extends AppliedPlan {
  readBack: ReadBack;
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

function tenantFolder(row: Record<string, unknown>): TenantFolder {
  return {
    id: String(row.id),
    name: String(row.name),
    parent_id: row.parent_id === null || row.parent_id === undefined ? null : String(row.parent_id),
    owner_group_id: String(row.owner_group_id),
    created_by: String(row.created_by),
  };
}

async function writeRows(args: ImportArgs): Promise<AppliedPlan> {
  const { plan } = args;
  const open = await openSession(args, plan.userId, 'write');
  try {
    await completeSync(args, plan.userId, open, 'first sync');
    const tenant = {
      folders: liveRows(open.session, 'folder').map(tenantFolder),
      hasUserSettings: liveRows(open.session, 'user_settings').some((row) => row.id === plan.userId),
    };
    const applied = await applyPlan(plan, tenant, {
      mintGroup: (parentGroup) => mintGroup(args.syncBase, open.token, parentGroup),
      createFolder: async (row) => {
        await open.session.db.create('folder', { ...row });
      },
      createUserSettings: async (row) => {
        await open.session.db.create('user_settings', row);
      },
    });

    await completeSync(args, plan.userId, open, 'post-write sync');
    const [pendingCreates, pendingOps] = await Promise.all([
      open.session.db.pendingCreateEntries(),
      open.session.db.pendingOps(),
    ]);
    assertNothingPending(pendingCreates.length, pendingOps.length, `user ${plan.userId} post-write sync`);
    return applied;
  } finally {
    closeAndRemove(open);
  }
}

async function readBack(args: ImportArgs): Promise<ReadBack> {
  const open = await openSession(args, args.plan.userId, 'verify');
  try {
    await completeSync(args, args.plan.userId, open, 'read-back sync');
    const folders = liveRows(open.session, 'folder').filter((row) => row.created_by === args.plan.userId);
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

// Writes the planned rows the tenant lacks as that user, then counts the user's own folders from a
// fresh replica. openSession signs a new token each time, so a slow write cannot expire the read-back.
export async function importUserLists(args: ImportArgs): Promise<ImportResult> {
  const applied = await writeRows(args);
  return { ...applied, readBack: await readBack(args) };
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

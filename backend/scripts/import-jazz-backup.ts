#!/usr/bin/env npx tsx
/**
 * Imports a Jazz-era backup (written by migration/jazz-export) into the rowboat-era backend.
 *
 * Usage:
 *   npx tsx scripts/import-jazz-backup.ts auth-db --backup <dir> --env <env file> --out <auth.db>
 *   npx tsx scripts/import-jazz-backup.ts lists   --backup <dir> --env <env file> --auth-db <copy of the installed auth.db>
 *
 * Prints only ids, counts, roles and errors.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExportUser, Manifest, UsersFile } from '../../migration/jazz-export/src/format.js';
import { createServer } from '../src/index.js';
import { buildAuthDb } from './jazz-import/auth-db.js';
import { grantShares } from './jazz-import/grant-shares.js';
import { planUser } from './jazz-import/map.js';
import { planShares, type SharePlan, shareReportLines, splitForeignFolders } from './jazz-import/shares.js';
import { loadTarget } from './jazz-import/target-config.js';
import { importUserLists } from './jazz-import/write-lists.js';

const USAGE = `Usage:
  npx tsx scripts/import-jazz-backup.ts auth-db --backup <dir> --env <env file> --out <auth.db>
  npx tsx scripts/import-jazz-backup.ts lists   --backup <dir> --env <env file> --auth-db <copy of the installed auth.db>`;

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function requireArg(args: Record<string, string | boolean>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string') {
    console.error(`missing --${name}`);
    console.error(USAGE);
    process.exit(1);
  }
  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function cmdAuthDb(args: Record<string, string | boolean>): Promise<void> {
  const backup = requireArg(args, 'backup');
  const env = requireArg(args, 'env');
  const out = requireArg(args, 'out');
  const users = readJson<UsersFile>(join(backup, 'users.json'));
  const result = await buildAuthDb(out, loadTarget(env, out), users);
  console.log(
    `users=${result.users} accounts=${result.accounts} verifications=${result.verifications} jwks=${result.jwksKeyId}`,
  );
}

async function cmdLists(args: Record<string, string | boolean>): Promise<number> {
  const backup = requireArg(args, 'backup');
  const env = requireArg(args, 'env');
  const authDb = requireArg(args, 'auth-db');
  if (!existsSync(authDb)) {
    console.error(`${authDb} does not exist`);
    return 1;
  }

  const manifest = readJson<Manifest>(join(backup, 'manifest.json'));
  if (manifest.failed.length > 0) {
    console.error(`manifest lists ${manifest.failed.length} failed export(s); re-run the export first`);
    return 1;
  }

  const users: ExportUser[] = [];
  let sharePlan: SharePlan;
  try {
    for (const entry of manifest.users) users.push(readJson<ExportUser>(join(backup, `${entry.userId}.json`)));
    sharePlan = planShares(users);
  } catch (err) {
    console.error(`error ${message(err)}`);
    return 1;
  }

  const target = loadTarget(env, authDb);
  const server = await createServer(target.config);
  const workDir = mkdtempSync(join(tmpdir(), 'jazz-import-'));
  const sessionTarget = { syncBase: target.syncBase, signJWT: server.signJWT, workDir };
  const groups = new Map<string, string>();
  let exitCode = 0;
  try {
    for (const [index, entry] of manifest.users.entries()) {
      const id = entry.userId;
      let plan: ReturnType<typeof planUser>;
      let result: Awaited<ReturnType<typeof importUserLists>>;
      try {
        plan = planUser(users[index]);
        result = await importUserLists({ plan, ...sessionTarget });
        for (const [folderId, groupId] of result.groups) groups.set(folderId, groupId);
      } catch (err) {
        console.error(`${id} error ${message(err)}`);
        return 1;
      }

      const { readBack } = result;
      const written = plan.counts;
      const nc = plan.notCarried;
      const foreign = splitForeignFolders(id, nc.foreignFolders, sharePlan.grants);
      console.log(
        `${id} already-present folders=${result.existingFolders} settings=${result.existingUserSettings ? 'yes' : 'no'}`,
      );
      console.log(`${id} written folders=${written.folders} items=${written.items} sessions=${written.sessions}`);
      console.log(
        `${id} read-back folders=${readBack.folders} items=${readBack.items} sessions=${readBack.sessions} settings=${readBack.userSettings ? 'yes' : 'no'}`,
      );
      console.log(`${id} manifest folders=${entry.folders} items=${entry.items} sessions=${entry.sessions}`);
      console.log(
        `${id} not-carried sibling-order-parents=${nc.siblingOrderParents} archivedAt=${nc.archivedAt.length} foreign-folders=${foreign.notCarried.length} carried-as-share=${foreign.carriedAsShare.length} owned-under-foreign=${nc.ownedUnderForeign.length} duplicate-item-ids=${nc.duplicateItemIds} duplicate-session-ids=${nc.duplicateSessionIds} defaulted-type=${nc.defaultedType} defaulted-sharing-mode=${nc.defaultedSharingMode}`,
      );

      const matches =
        readBack.folders === written.folders &&
        readBack.items === written.items &&
        readBack.sessions === written.sessions &&
        readBack.userSettings;
      if (!matches) {
        console.error(`${id} read-back does not match written counts`);
        exitCode = 1;
      }
    }

    let sharedIn: Awaited<ReturnType<typeof grantShares>>;
    try {
      sharedIn = await grantShares(sessionTarget, sharePlan.grants, groups);
    } catch (err) {
      console.error(`shares error ${message(err)}`);
      return 1;
    }
    for (const s of sharedIn) {
      console.log(`${s.recipientUserId} shared-in folders=${s.granted} visible=${s.visible}`);
      if (s.visible !== s.granted) {
        console.error(`${s.recipientUserId} ${s.granted - s.visible} granted folder(s) not visible`);
        exitCode = 1;
      }
    }
    for (const line of shareReportLines(sharePlan)) console.log(line);
    console.log(`share-invites-not-carried=${manifest.shareInvites}`);
    return exitCode;
  } finally {
    server.db.close();
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case 'auth-db':
      await cmdAuthDb(args);
      break;
    case 'lists':
      process.exitCode = await cmdLists(args);
      break;
    default:
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`error ${message(err)}`);
  process.exit(1);
});

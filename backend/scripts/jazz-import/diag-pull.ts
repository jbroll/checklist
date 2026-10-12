import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeRow } from '@jbroll/rowboat-cli/src/column-types.js';
import { openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { createServer } from '../../src/index.js';
import { loadTarget } from './target-config.js';

const [userId, envPath, authDb] = process.argv.slice(2);
const target = loadTarget(envPath, authDb);
const server = await createServer(target.config);
const manifest = compileSchema(schema).manifest;
const dir = mkdtempSync(join(tmpdir(), 'diag-pull-'));
try {
  const session = await openDataSession({
    manifest,
    filename: join(dir, 'replica.db'),
    syncUrl: target.syncBase,
    author: userId,
    token: await server.signJWT(userId),
    appVersion: 0,
  });
  await session.sync();
  await session.sync();
  const folders = (session.sqlite.prepare('select * from "folder"').all() as Record<string, unknown>[]).map(
    (r) => decodeRow(manifest, 'folder', r) as Record<string, unknown>,
  );
  console.log(`syncBase=${target.syncBase} folders=${folders.length}`);
  for (const f of folders) {
    const items = f.items && typeof f.items === 'object' ? Object.keys(f.items).length : 0;
    const sessions =
      f.sessions && typeof f.sessions === 'object'
        ? Object.values(f.sessions as Record<string, Record<string, unknown>>)
        : [];
    const sessionSummary = sessions
      .map(
        (s) =>
          `${String(s.id).slice(0, 8)}@${new Date(Number(s.createdAt)).toISOString().slice(0, 16)}${s.archived ? '(archived)' : ''}${s.__deleted ? '(deleted)' : ''}`,
      )
      .join(' ');
    console.log(
      `folder id=${f.id} name=${JSON.stringify(f.name)} type=${JSON.stringify(f.type)} archived=${f.archived} parent=${f.parent_id} group=${f.owner_group_id} created=${new Date(Number(f.created_at)).toISOString()} created_by=${f.created_by} items=${items} sessions=${sessions.length} [${sessionSummary}]`,
    );
  }
  const settings = session.sqlite
    .prepare(
      'select id, owner_group_id, __deleted, subscription_tier, subscription_status, session_retention_days, max_lists from "user_settings"',
    )
    .all() as {
    id: string;
    owner_group_id: string;
    __deleted: number;
    subscription_tier: string;
    subscription_status: string;
    session_retention_days: number;
    max_lists: number;
  }[];
  console.log(`user_settings rows=${settings.length}`);
  for (const s of settings) {
    console.log(
      `user_settings id=${s.id} group=${s.owner_group_id} deleted=${s.__deleted} matches_user=${s.owner_group_id === userId} tier=${s.subscription_tier} status=${s.subscription_status} retention_days=${s.session_retention_days} max_lists=${s.max_lists}`,
    );
  }
  session.close();
} finally {
  server.db.close();
  rmSync(dir, { recursive: true, force: true });
}

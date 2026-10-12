import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { createServer } from '../../src/index.js';
import { loadTarget } from './target-config.js';

// Reproduces the browser's failing push: a folder row whose owner_group_id is a group the author
// holds no role on (what the app invents while signed out), versus one scoped to the user's own
// root group. Prints the outcome of each; a rejected push writes nothing.
const [userId, envPath, authDb] = process.argv.slice(2);
const target = loadTarget(envPath, authDb);
const server = await createServer(target.config);
const manifest = compileSchema(schema).manifest;

async function pushWithGroup(label: string, groupId: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'diag-push-'));
  const session = await openDataSession({
    manifest,
    filename: join(dir, 'replica.db'),
    syncUrl: target.syncBase,
    author: userId,
    token: await server.signJWT(userId),
    appVersion: 0,
  });
  try {
    await session.sync();
    const now = Date.now();
    await session.db.create('folder', {
      id: `diag-push-${label}-${now}`,
      owner_group_id: groupId,
      name: 'diag push probe',
      type: 'folder',
      parent_id: null,
      sharing_mode: 'private',
      archived: false,
      expanded: false,
      created_by: userId,
      created_at: now,
      updated_at: now,
      items: {},
      sessions: {},
      default_items: {},
      show_zone_headings: false,
      auto_categorize_enabled: false,
      autocomplete_domain: 'none',
    });
    await session.sync();
    console.log(`${label}: push accepted (group=${groupId})`);
  } catch (err) {
    console.log(`${label}: push rejected (group=${groupId}) -> ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    session.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

await pushWithGroup('invented-group', crypto.randomUUID());
await pushWithGroup('root-group', userId);
server.db.close();

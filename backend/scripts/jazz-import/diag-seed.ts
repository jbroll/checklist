import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { createServer } from '../../src/index.js';
import { loadTarget } from './target-config.js';

// Gives a user import-shaped server state: a user_settings row in their root group and one folder
// in a freshly minted group, exactly as import-jazz-backup.ts writes them. Used to reproduce a
// browser that signs in to an account that already holds server rows.
const [userId, envPath, authDb] = process.argv.slice(2);
const target = loadTarget(envPath, authDb);
const server = await createServer(target.config);
const manifest = compileSchema(schema).manifest;
const token = await server.signJWT(userId);
const dir = mkdtempSync(join(tmpdir(), 'diag-seed-'));
try {
  const session = await openDataSession({
    manifest,
    filename: join(dir, 'replica.db'),
    syncUrl: target.syncBase,
    author: userId,
    token,
    appVersion: 0,
  });
  await session.sync();

  const res = await fetch(`${target.syncBase}/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`mint failed ${res.status}`);
  const { groupId } = (await res.json()) as { groupId: string };
  const now = Date.now();

  await session.db.create('folder', {
    id: `diag-seed-list-${now}`,
    owner_group_id: groupId,
    name: 'Seeded server list',
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: userId,
    created_at: now,
    updated_at: now,
    items: { i1: { id: 'i1', name: 'server item', type: 'item', path: 'server item', expanded: false, sortOrder: 0, archived: false, defaultQuantity: '', createdAt: now, __order: 'a0' } },
    sessions: {},
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  });
  await session.db.create('user_settings', {
    id: userId,
    owner_group_id: userId,
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: 3,
    session_retention_days: 7,
    subscription_synced_at: 0,
    view_folder_expanded: {},
    view_template_category_expanded: {},
    view_session_category_expanded: {},
  });
  await session.sync();
  console.log(`seeded folder in group ${groupId} and user_settings in root group for ${userId}`);
  session.close();
} finally {
  server.db.close();
  rmSync(dir, { recursive: true, force: true });
}

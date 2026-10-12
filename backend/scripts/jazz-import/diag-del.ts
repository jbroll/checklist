import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { createServer } from '../../src/index.js';
import { loadTarget } from './target-config.js';

// Tombstones rows this session's diagnostics created (ids passed on the command line).
const [userId, envPath, authDb, ...ids] = process.argv.slice(2);
const target = loadTarget(envPath, authDb);
const server = await createServer(target.config);
const manifest = compileSchema(schema).manifest;
const dir = mkdtempSync(join(tmpdir(), 'diag-del-'));
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
  for (const id of ids) {
    await session.db.remove('folder', id);
    console.log(`removed folder ${id}`);
  }
  await session.sync();
  const left = session.sqlite
    .prepare('select id from "folder" where id like ? and __deleted = 0')
    .all('diag-push-%') as { id: string }[];
  console.log(`diag rows still live: ${left.length}`);
  session.close();
} finally {
  server.db.close();
  rmSync(dir, { recursive: true, force: true });
}

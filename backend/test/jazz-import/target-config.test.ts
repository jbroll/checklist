import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTarget } from '../../scripts/jazz-import/target-config.js';

describe('loadTarget', () => {
  it('builds a ServerConfig and sync base from an env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'target-'));
    const env = join(dir, 'secrets.env');
    writeFileSync(
      env,
      'BETTER_AUTH_SECRET=s3cret-s3cret-s3cret-s3cret\nFRONTEND_URL=https://checklist-test.example\nROWBOAT_DATABASE_ID=db_abc\nROWBOAT_URL=https://rowboat.example\n',
    );
    const t = loadTarget(env, join(dir, 'auth.db'));
    expect(t.syncBase).toBe('https://rowboat.example/db/db_abc/api/sync');
    expect(t.config).toMatchObject({
      authSecret: 's3cret-s3cret-s3cret-s3cret',
      baseUrl: 'https://checklist-test.example',
      frontendUrl: 'https://checklist-test.example',
      rowboatDatabaseId: 'db_abc',
      dbPath: join(dir, 'auth.db'),
    });
  });

  it('names a missing variable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'target-'));
    const env = join(dir, 'secrets.env');
    writeFileSync(env, 'BETTER_AUTH_SECRET=x\n');
    expect(() => loadTarget(env, join(dir, 'auth.db'))).toThrow('FRONTEND_URL');
  });
});

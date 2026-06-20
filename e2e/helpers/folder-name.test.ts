import { describe, expect, it } from 'vitest';
import { uniqueFolderName } from './folder-name';

describe('uniqueFolderName', () => {
  it('includes the prefix', () => {
    expect(uniqueFolderName('Invite Test')).toContain('Invite Test');
  });

  it('produces distinct names on repeated calls', () => {
    const a = uniqueFolderName('X');
    const b = uniqueFolderName('X');
    expect(a).not.toBe(b);
  });
});

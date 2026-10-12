import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEngines, satisfiesCaret, toolchainProblems } from './toolchain';

const repoRoot = path.dirname(import.meta.dirname);

describe('satisfiesCaret', () => {
  it('accepts any version in the major of a .0.0 floor', () => {
    expect(satisfiesCaret('v24.0.0', '^24.0.0')).toBe(true);
    expect(satisfiesCaret('v24.18.0', '^24.0.0')).toBe(true);
    expect(satisfiesCaret('v24.21.0', '^24.0.0')).toBe(true);
    expect(satisfiesCaret('12.2.0', '^12.0.0')).toBe(true);
  });

  it('rejects another major', () => {
    expect(satisfiesCaret('v22.23.2', '^24.0.0')).toBe(false);
    expect(satisfiesCaret('v26.0.0', '^24.0.0')).toBe(false);
    expect(satisfiesCaret('10.9.4', '^12.0.0')).toBe(false);
  });

  it('rejects an earlier version within the major', () => {
    expect(satisfiesCaret('v24.20.9', '^24.21.0')).toBe(false);
  });

  it('throws on a range it does not understand', () => {
    expect(() => satisfiesCaret('v24.21.0', '>=24')).toThrow(/not a version/);
  });
});

describe('toolchainProblems', () => {
  it('names each tool outside its pinned major', () => {
    const engines = { node: '^24.0.0', npm: '^12.0.0' };
    expect(toolchainProblems(engines, { node: 'v24.18.0', npm: '12.2.0' })).toEqual([]);
    expect(toolchainProblems(engines, { node: 'v22.23.2', npm: '10.9.4' })).toEqual([
      'node v22.23.2 does not satisfy ^24.0.0',
      'npm 10.9.4 does not satisfy ^12.0.0',
    ]);
  });
});

describe('the pinned toolchain', () => {
  it('is the same in every package with its own lockfile, and .nvmrc names its Node major', () => {
    const engines = readEngines(repoRoot);
    expect(readEngines(path.join(repoRoot, 'backend'))).toEqual(engines);
    expect(readEngines(path.join(repoRoot, 'migration/jazz-export'))).toEqual(engines);
    const nvmrc = readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8').trim();
    expect(engines.node).toMatch(/^\^\d+\.0\.0$/);
    expect(engines.npm).toMatch(/^\^\d+\.0\.0$/);
    expect(nvmrc).toBe(engines.node.slice(1).split('.')[0]);
  });
});

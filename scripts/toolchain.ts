import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Each npm major writes different lockfile metadata, so every install must use prod's npm.

export interface Toolchain {
  node: string;
  npm: string;
}

function parse(version: string): number[] {
  const m = /^[v^]?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`not a version: "${version}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// A caret range: the same major, and at least the stated version.
export function satisfiesCaret(version: string, range: string): boolean {
  const have = parse(version);
  const want = parse(range);
  if (have[0] !== want[0]) return false;
  for (let i = 1; i < 3; i++) {
    if (have[i] !== want[i]) return (have[i] ?? 0) > (want[i] ?? 0);
  }
  return true;
}

export function toolchainProblems(engines: Toolchain, have: Toolchain): string[] {
  return (['node', 'npm'] as const)
    .filter((tool) => !satisfiesCaret(have[tool], engines[tool]))
    .map((tool) => `${tool} ${have[tool]} does not satisfy ${engines[tool]}`);
}

export function readEngines(packageDir: string): Toolchain {
  const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  return pkg.engines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const have = { node: process.version, npm: execFileSync('npm', ['--version']).toString().trim() };
  const problems = toolchainProblems(readEngines(repoRoot), have);
  for (const problem of problems) console.error(`toolchain: ${problem}`);
  if (problems.length > 0) {
    console.error('toolchain: run `nvm use` in the repo, then `npm install -g npm@12`');
    process.exit(1);
  }
}

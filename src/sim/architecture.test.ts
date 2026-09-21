/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// DD §15: the sim core is pure TypeScript — no React, no third-party
// dependencies, nothing from the UI — so identical seed + action log replays
// identically and the Phase 31 headless harness runs on Node alone. This
// test is the enforcement; eslint.config.js's restricted-imports rule is the
// in-editor echo of it.

const ROOT = join(import.meta.dirname, '..');
const CORE_DIRS = ['sim', 'content'];
const CORE_FILES = ['tuning.ts'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    out.push(m[1]!);
  }
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]!);
  return out;
}

describe('sim core isolation (DD §15)', () => {
  const files = [
    ...CORE_DIRS.flatMap((d) => walk(join(ROOT, d))),
    ...CORE_FILES.map((f) => join(ROOT, f)),
  ].filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('finds the core', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${relative(ROOT, file)} imports only relative core modules`, () => {
      for (const spec of imports(file)) {
        expect(spec, `non-relative import "${spec}"`).toMatch(/^\.\.?\//);
        expect(spec, `import from the UI "${spec}"`).not.toMatch(/\/ui\//);
      }
    });
  }
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * PR 615 — moved heavy CI off the per-merge path. The `pnpm run check`
 * gate is now expected to stay fast (no e2e, no full build, no
 * dead-code) so the developer machine doesn't burn 10+ minutes per
 * deploy. Heavy steps live under `pnpm run check:heavy` and run only
 * nightly in CI.
 *
 * This spec freezes that split so a future refactor that quietly
 * re-adds (say) test:e2e to `check` gets caught at PR time instead
 * of after the next deploy script clogs the developer's PC for ten
 * minutes.
 */

function loadScripts(): Record<string, string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
  return pkg.scripts ?? {};
}

const HEAVY_TOKENS = ['test:e2e', 'check:deadcode', 'build:server', 'measure:baseline'] as const;
const FAST_TOKENS = ['lint', 'typecheck', 'check:scripts', 'check:maintainability', 'content:check', 'test'] as const;

describe('package.json check / check:heavy split', () => {
  it('exposes both check and check:heavy', () => {
    const scripts = loadScripts();
    expect(scripts.check, "'check' script must exist (fast gate)").toBeTruthy();
    expect(scripts['check:heavy'], "'check:heavy' script must exist (nightly gate)").toBeTruthy();
  });

  it("'check' (fast) does not invoke any heavy step", () => {
    const scripts = loadScripts();
    const check = scripts.check ?? '';
    for (const token of HEAVY_TOKENS) {
      expect(
        check.includes(token),
        `'check' must stay fast — found heavy token '${token}' in: ${check}`,
      ).toBe(false);
    }
  });

  it("'check' covers the fast core (lint/typecheck/test/content)", () => {
    const scripts = loadScripts();
    const check = scripts.check ?? '';
    for (const token of FAST_TOKENS) {
      expect(
        check.includes(token),
        `'check' must cover fast core — missing token '${token}' in: ${check}`,
      ).toBe(true);
    }
  });

  it("'check:heavy' invokes the heavy steps", () => {
    const scripts = loadScripts();
    const heavy = scripts['check:heavy'] ?? '';
    for (const token of HEAVY_TOKENS) {
      expect(
        heavy.includes(token),
        `'check:heavy' must include heavy token '${token}' — got: ${heavy}`,
      ).toBe(true);
    }
  });
});
